"""
Capa de pagos agnóstica de proveedor para Ciphra Pro.

Principios de diseño (seguridad ante todo):
  1. El cliente pide un checkout (AUTENTICADO). El backend crea una "sesión de pago"
     y devuelve la URL a la que redirigir: el checkout alojado del proveedor (Stripe /
     Mercado Pago) o la página sandbox en modo prueba.
  2. El plan Pro SOLO se activa con una confirmación verificada del lado servidor:
     - real:     webhook firmado del proveedor (Stripe) o verificación del pago vía
                 SDK (Mercado Pago, sdk.payment().get).
     - sandbox:  endpoint /sandbox/complete, deshabilitado cuando PAYMENTS_LIVE=true.
     NUNCA se confía en el cliente ni en la URL de retorno para activar Pro.
  3. Ningún dato de tarjeta toca este servidor: el cobro ocurre en la página alojada
     del proveedor (sin requisitos PCI para nosotros).

Para pasar a cobro real (cuando un titular adulto tenga cuenta de comerciante):
  - definir en .env: PAYMENT_PROVIDER (stripe|mercadopago), las claves del proveedor,
    PUBLIC_BASE_URL y PAYMENTS_LIVE=true.
  - no requiere tocar este código.
"""
import os
import time
import hmac
import hashlib
import secrets
import logging
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("ciphra.payments")

router = APIRouter(prefix="/api/payments")

# --- Configuración ---
PRICE_USD = 5.00
PRODUCT_NAME = "Ciphra Pro (mensual)"

PROVIDER = os.getenv("PAYMENT_PROVIDER", "sandbox").strip().lower()
PAYMENTS_LIVE = os.getenv("PAYMENTS_LIVE", "false").strip().lower() == "true"
BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

# --- Pago por transferencia (alias/CBU) con aprobación manual ---
# Pensado para quien todavía no puede usar la API de cobro (p. ej. titular menor de edad):
# el usuario transfiere a tu alias/CBU y vos aprobás el pago a mano desde el panel admin.
TRANSFER_ALIAS = os.getenv("TRANSFER_ALIAS", "").strip()
TRANSFER_CBU = os.getenv("TRANSFER_CBU", "").strip()
TRANSFER_HOLDER = os.getenv("TRANSFER_HOLDER", "").strip()
TRANSFER_AMOUNT = os.getenv("TRANSFER_AMOUNT", "5000").strip()
TRANSFER_CURRENCY = os.getenv("TRANSFER_CURRENCY", "ARS").strip()

# --- Link de Pago (Mercado Pago / Stripe Payment Link) con aprobación manual ---
# Botón "Pagar" que abre un link de cobro hosted (creado a mano en tu app de MP, sin API).
# La plata va a tu cuenta; la confirmación es manual hasta que conectes la API.
PAYMENT_LINK_URL = os.getenv("PAYMENT_LINK_URL", "").strip()

# AUTO-APROBACIÓN (modo confianza): al tocar "Ya pagué", se activa Pro al instante sin que
# vos confirmes. UX inmediata, PERO alguien podría declarar un pago falso y obtener Pro gratis.
# Pensado para arranque chico/confiable. Desactivar (o pasar a la API de MP) cuando crezca.
AUTO_APPROVE = os.getenv("PAYMENT_AUTO_APPROVE", "false").strip().lower() == "true"

# --- Regionalización (subdominios int. / latam.) ---
# int  -> Stripe (USD), idioma por defecto inglés.
# latam -> Mercado Pago o Belo (el usuario elige), idioma por defecto español.
REGION_LANGS = {"int": ["en", "es", "pt"], "latam": ["es", "pt", "en"]}
REGION_DEFAULT_LANG = {"int": "en", "latam": "es"}
REGION_PROVIDERS = {"int": ["stripe"], "latam": ["mercadopago", "belo"]}


def detect_region(request: Request):
    """Región por subdominio (int. / latam.) o por override ?region= (para probar local)."""
    q = request.query_params.get("region")
    if q in ("int", "latam"):
        return q
    host = (request.headers.get("host") or "").lower()
    if host.startswith("int."):
        return "int"
    if host.startswith("latam."):
        return "latam"
    return None  # local u otro -> se usa el PROVIDER del entorno


# --- País dentro de LATAM (Brasil es mercado propio en Mercado Pago) ---
# El path define el país: latam.ciphra.com/ar (es, ARS) | /br (pt, BRL, Pix).
COUNTRY_LANG = {"AR": "es", "BR": "pt"}
COUNTRY_CURRENCY = {"AR": "ARS", "BR": "BRL"}
COUNTRY_PRICE_DEFAULT = {"AR": "5000", "BR": "25"}  # ≈ USD 5 (ajustable por env)


def detect_country(request: Request, body=None):
    """País dentro de LATAM (AR/BR): por ?country=, por body, o por el path del Referer (/ar, /br).
    Default AR. Brasil exige cuenta-comercio MP Brasil propia para cobrar de verdad."""
    c = request.query_params.get("country") or (body or {}).get("country")
    if not c:
        ref = (request.headers.get("referer") or "").lower()
        for code in ("br", "ar"):
            if f"/{code}" in ref:
                c = code
                break
    c = (c or "ar").upper()
    return c if c in COUNTRY_CURRENCY else "AR"


def _mp_creds(country: str):
    """Token + moneda + precio de Mercado Pago según país (AR/BR son cuentas distintas).
    Cae a las variables genéricas (MP_ACCESS_TOKEN, MP_CURRENCY, MP_PRICE_LOCAL) si no hay por país."""
    token = os.getenv(f"MP_ACCESS_TOKEN_{country}") or os.getenv("MP_ACCESS_TOKEN")
    currency = COUNTRY_CURRENCY.get(country) or os.getenv("MP_CURRENCY", "ARS")
    price = float(
        os.getenv(f"MP_PRICE_LOCAL_{country}")
        or os.getenv("MP_PRICE_LOCAL")
        or COUNTRY_PRICE_DEFAULT.get(country, "5000")
    )
    return token, currency, price


def _sandbox_checkout(email: str):
    token = _new_session(email)
    return {"checkout_url": f"{BASE_URL}/checkout.html?session={token}", "sandbox": True}

# Cola de pagos pendientes (persistida y CIFRADA, igual que users/chats).
PENDING_FILE = "payments_pending.json"


def _load_pending() -> dict:
    from main import decrypt_data
    if os.path.exists(PENDING_FILE):
        with open(PENDING_FILE, "rb") as f:
            return decrypt_data(f.read())
    return {}


def _save_pending(data: dict):
    from main import encrypt_data
    with open(PENDING_FILE, "wb") as f:
        f.write(encrypt_data(data))


def _reference_for(email: str) -> str:
    """Código corto y estable por usuario para que puedas casar la transferencia."""
    h = hashlib.sha256(email.encode()).hexdigest()[:4].upper()
    return f"CIPHRA-{h}"


def _is_admin(request: Request) -> bool:
    """El panel admin se protege con ADMIN_TOKEN (comparación en tiempo constante)."""
    admin = os.getenv("ADMIN_TOKEN")
    if not admin:
        return False
    provided = request.headers.get("X-Admin-Token") or request.headers.get("Authorization") or ""
    return bool(provided) and hmac.compare_digest(provided, admin)

# Sesiones de pago efímeras en memoria (no se persisten: viven solo durante el checkout).
_SESSION_TTL = 30 * 60  # 30 minutos
_sessions: dict[str, dict] = {}


def _gc():
    now = time.time()
    stale = [t for t, s in _sessions.items() if now - s["created_at"] > _SESSION_TTL]
    for t in stale:
        _sessions.pop(t, None)


def _new_session(email: str) -> str:
    _gc()
    token = "pay_" + secrets.token_urlsafe(24)
    _sessions[token] = {"email": email, "status": "pending", "created_at": time.time()}
    return token


def _auth_email(request: Request):
    """Resuelve el email del usuario autenticado a partir del token de sesión."""
    from main import get_user_from_token
    user = get_user_from_token(request)
    return user["email"] if user else None


def _upgrade_to_pro(email: str) -> bool:
    """Activa el plan Pro. SOLO se llama desde confirmaciones verificadas server-side."""
    from main import load_users, save_users
    users = load_users()
    if email in users:
        users[email]["plan"] = "pro"
        users[email]["pro_since"] = datetime.now().isoformat()
        save_users(users)
        log.info("Plan Pro activado para %s", email)
        return True
    log.warning("Pago confirmado para email desconocido: %s", email)
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints públicos del front
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/config")
async def payment_config(request: Request):
    """Datos públicos para el checkout: precio, región y proveedores disponibles."""
    region = detect_region(request)
    if region in REGION_PROVIDERS:
        # En los subdominios regionales, las opciones las define la región.
        out = {
            "price_usd": PRICE_USD,
            "product": PRODUCT_NAME,
            "region": region,
            "providers": REGION_PROVIDERS[region],
            "method": "region",
        }
        if region == "latam":
            country = detect_country(request)
            out["country"] = country
            out["currency"] = COUNTRY_CURRENCY.get(country, "ARS")
            out["lang"] = COUNTRY_LANG.get(country)
            _, _, out["price_local"] = _mp_creds(country)
        return out
    # Local / sin subdominio -> comportamiento por env (transfer/link/sandbox).
    method = "redirect"
    if PROVIDER == "link" and PAYMENT_LINK_URL:
        method = "link"
    elif PROVIDER == "transfer" and TRANSFER_ALIAS:
        method = "transfer"
    elif not (PAYMENTS_LIVE and PROVIDER in ("stripe", "mercadopago")):
        method = "sandbox"
    return {
        "price_usd": PRICE_USD,
        "product": PRODUCT_NAME,
        "provider": PROVIDER,
        "live": PAYMENTS_LIVE,
        "method": method,
        "region": None,
    }


@router.post("/checkout")
async def create_checkout(request: Request):
    """Inicia el checkout. Rutea por región (int->Stripe, latam->MP/Belo) y, fuera de los
    subdominios, por el PROVIDER del entorno. Degrada a sandbox si faltan credenciales."""
    email = _auth_email(request)
    if not email:
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        body = {}
    requested = (body or {}).get("provider")
    region = detect_region(request)

    # --- Ruteo por región (subdominios reales) ---
    if region == "int":
        if PAYMENTS_LIVE and os.getenv("STRIPE_SECRET_KEY"):
            return await _stripe_checkout(email)
        return _sandbox_checkout(email)
    if region == "latam":
        country = detect_country(request, body)
        prov = requested if requested in ("mercadopago", "belo") else "mercadopago"
        if prov == "belo":
            if PAYMENTS_LIVE and os.getenv("BELO_API_KEY"):
                return await _belo_checkout(email)
        else:
            token, _, _ = _mp_creds(country)  # AR -> MP_ACCESS_TOKEN_AR, BR -> _BR
            if PAYMENTS_LIVE and token:
                return await _mp_checkout(email, country)
        # Sin credenciales (p. ej. Brasil aún sin cuenta-comercio): alias si está, si no sandbox.
        if TRANSFER_ALIAS:
            return _transfer_checkout(email)
        return _sandbox_checkout(email)

    # --- Local / sin subdominio -> PROVIDER del entorno ---
    if PROVIDER == "link" and PAYMENT_LINK_URL:
        return _link_checkout(email)
    if PROVIDER == "transfer" and TRANSFER_ALIAS:
        return _transfer_checkout(email)
    if PAYMENTS_LIVE and PROVIDER == "stripe":
        return await _stripe_checkout(email)
    if PAYMENTS_LIVE and PROVIDER == "mercadopago":
        return await _mp_checkout(email)
    return _sandbox_checkout(email)


async def _belo_checkout(email: str):
    """Stub de Belo. belo ofrece cobros, pero su API de comercios requiere integración
    propia; cuando tengas las credenciales (BELO_API_KEY) se completa acá igual que MP."""
    api_key = os.getenv("BELO_API_KEY")
    if not api_key:
        return JSONResponse({"error": "Belo no configurado (falta BELO_API_KEY)"}, status_code=503)
    # TODO: llamar a la API real de Belo para crear el cobro y devolver su checkout_url.
    log.warning("Belo checkout solicitado pero la integración real no está implementada todavía.")
    return JSONResponse({"error": "Belo todavía no está disponible"}, status_code=503)


# ─────────────────────────────────────────────────────────────────────────────
# Transferencia (alias/CBU) + aprobación manual
# ─────────────────────────────────────────────────────────────────────────────
def _transfer_checkout(email: str):
    """Devuelve los datos para transferir. En modo confianza (AUTO_APPROVE) activa Pro de una."""
    pending = _load_pending()
    ref = _reference_for(email)
    rec = pending.get(email) or {}
    now = datetime.now().isoformat()
    approved = _upgrade_to_pro(email) if AUTO_APPROVE else False
    if rec.get("status") != "approved":
        entry = {
            "email": email,
            "reference": ref,
            "amount": TRANSFER_AMOUNT,
            "currency": TRANSFER_CURRENCY,
            "status": "approved" if approved else "pending",
            "created_at": rec.get("created_at") or now,
        }
        if approved:
            entry["approved_at"] = now
            entry["auto"] = True
        pending[email] = entry
        _save_pending(pending)
    return {
        "approved": approved,
        "transfer": {
            "alias": TRANSFER_ALIAS,
            "cbu": TRANSFER_CBU,
            "holder": TRANSFER_HOLDER,
            "amount": TRANSFER_AMOUNT,
            "currency": TRANSFER_CURRENCY,
            "reference": ref,
        }
    }


def _link_checkout(email: str):
    """Botón Pagar -> link de cobro hosted. En modo confianza (AUTO_APPROVE) activa Pro de una;
    si no, queda pendiente para aprobar."""
    pending = _load_pending()
    ref = _reference_for(email)
    rec = pending.get(email) or {}
    now = datetime.now().isoformat()
    approved = _upgrade_to_pro(email) if AUTO_APPROVE else False
    if rec.get("status") != "approved":
        entry = {
            "email": email,
            "reference": ref,
            "amount": TRANSFER_AMOUNT,
            "currency": TRANSFER_CURRENCY,
            "status": "approved" if approved else "pending",
            "method": "link",
            "created_at": rec.get("created_at") or now,
        }
        if approved:
            entry["approved_at"] = now
            entry["auto"] = True
        pending[email] = entry
        _save_pending(pending)
    return {"payment_link": PAYMENT_LINK_URL, "reference": ref, "approved": approved}


@router.post("/transfer/claim")
async def transfer_claim(request: Request):
    """El usuario declara que ya transfirió -> queda 'reclamado' para que lo apruebes."""
    email = _auth_email(request)
    if not email:
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    pending = _load_pending()
    rec = pending.get(email)
    if not rec:
        rec = {"email": email, "reference": _reference_for(email),
               "amount": TRANSFER_AMOUNT, "currency": TRANSFER_CURRENCY,
               "created_at": datetime.now().isoformat()}
    if rec.get("status") == "approved":
        return {"success": True, "status": "approved"}
    now = datetime.now().isoformat()
    rec["claimed_at"] = now

    # Modo confianza: activar Pro al instante, sin aprobación manual.
    if AUTO_APPROVE:
        ok = _upgrade_to_pro(email)
        rec["status"] = "approved" if ok else "claimed"
        if ok:
            rec["approved_at"] = now
            rec["auto"] = True
        pending[email] = rec
        _save_pending(pending)
        if ok:
            return {"success": True, "status": "approved", "message": "¡Listo! Pro activado."}
        return {"success": True, "status": "claimed"}

    rec["status"] = "claimed"
    pending[email] = rec
    _save_pending(pending)
    return {"success": True, "status": "claimed",
            "message": "Recibido. Tu pago va a quedar activo apenas lo confirmemos."}


@router.get("/status")
async def payment_status(request: Request):
    """El front puede consultar si ya le activaron Pro."""
    email = _auth_email(request)
    if not email:
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    from main import load_users
    plan = (load_users().get(email) or {}).get("plan", "free")
    rec = _load_pending().get(email) or {}
    return {"plan": plan, "status": rec.get("status", "none")}


# ─────────────────────────────────────────────────────────────────────────────
# Panel admin (protegido con ADMIN_TOKEN) — para aprobar/rechazar transferencias
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/admin/pending")
async def admin_pending(request: Request):
    if not _is_admin(request):
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    pending = _load_pending()
    items = [v for v in pending.values() if v.get("status") in ("pending", "claimed")]
    items.sort(key=lambda r: r.get("claimed_at") or r.get("created_at") or "", reverse=True)
    return {"pending": items}


@router.post("/admin/approve")
async def admin_approve(request: Request):
    if not _is_admin(request):
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        data = {}
    email = (data or {}).get("email", "")
    pending = _load_pending()
    if email not in pending:
        return JSONResponse({"error": "Pago pendiente no encontrado"}, status_code=404)
    ok = _upgrade_to_pro(email)
    if not ok:
        return JSONResponse({"error": "Usuario no existe"}, status_code=404)
    pending[email]["status"] = "approved"
    pending[email]["approved_at"] = datetime.now().isoformat()
    _save_pending(pending)
    return {"success": True, "message": f"Pro activado para {email}"}


@router.post("/admin/reject")
async def admin_reject(request: Request):
    if not _is_admin(request):
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        data = {}
    email = (data or {}).get("email", "")
    pending = _load_pending()
    if email not in pending:
        return JSONResponse({"error": "Pago pendiente no encontrado"}, status_code=404)
    pending[email]["status"] = "rejected"
    pending[email]["rejected_at"] = datetime.now().isoformat()
    _save_pending(pending)
    return {"success": True, "message": f"Pago rechazado para {email}"}


@router.post("/sandbox/complete")
async def sandbox_complete(request: Request):
    """Confirma un pago de PRUEBA. Bloqueado por completo si PAYMENTS_LIVE=true."""
    if PAYMENTS_LIVE:
        return JSONResponse({"error": "Sandbox deshabilitado en modo live"}, status_code=403)
    email = _auth_email(request)
    if not email:
        return JSONResponse({"error": "No autorizado"}, status_code=401)
    try:
        data = await request.json()
    except Exception:
        data = {}
    token = (data or {}).get("session", "")
    sess = _sessions.get(token)
    if not sess or sess["email"] != email:
        return JSONResponse({"error": "Sesión de pago inválida"}, status_code=400)
    sess["status"] = "approved"
    ok = _upgrade_to_pro(email)
    return {"success": ok, "message": "Pago de prueba confirmado. Plan Pro activado." if ok else "No se pudo activar."}


# ─────────────────────────────────────────────────────────────────────────────
# Stripe (se activa con PAYMENT_PROVIDER=stripe + claves + PAYMENTS_LIVE=true)
# ─────────────────────────────────────────────────────────────────────────────
async def _stripe_checkout(email: str):
    try:
        import stripe
    except ImportError:
        return JSONResponse({"error": "Stripe no está instalado en el servidor"}, status_code=503)
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe.api_key:
        return JSONResponse({"error": "Falta STRIPE_SECRET_KEY"}, status_code=503)
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": PRODUCT_NAME},
                    "unit_amount": int(PRICE_USD * 100),
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            success_url=f"{BASE_URL}/checkout.html?status=success",
            cancel_url=f"{BASE_URL}/checkout.html?status=cancel",
            client_reference_id=email,
            metadata={"email": email},
        )
        return {"checkout_url": session.url, "sandbox": False}
    except Exception as e:
        log.error("Stripe checkout error: %s", e)
        return JSONResponse({"error": "No se pudo crear el checkout"}, status_code=502)


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    try:
        import stripe
    except ImportError:
        return JSONResponse({"error": "unavailable"}, status_code=503)
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not secret:
        return JSONResponse({"error": "webhook no configurado"}, status_code=503)
    try:
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except Exception as e:
        log.warning("Webhook Stripe inválido: %s", e)
        return JSONResponse({"error": "firma inválida"}, status_code=400)
    if event["type"] == "checkout.session.completed":
        obj = event["data"]["object"]
        email = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("email")
        if email:
            _upgrade_to_pro(email)
    return {"received": True}


# ─────────────────────────────────────────────────────────────────────────────
# Mercado Pago (se activa con PAYMENT_PROVIDER=mercadopago + token + PAYMENTS_LIVE=true)
# ─────────────────────────────────────────────────────────────────────────────
async def _mp_checkout(email: str, country: str = "AR"):
    try:
        import mercadopago
    except ImportError:
        return JSONResponse({"error": "mercadopago no está instalado"}, status_code=503)
    # AR y BR son cuentas/mercados distintos en MP: token, moneda y precio por país.
    token, currency, price_local = _mp_creds(country)
    if not token:
        return JSONResponse({"error": f"Falta MP_ACCESS_TOKEN_{country}"}, status_code=503)
    sdk = mercadopago.SDK(token)
    preference = {
        "items": [{
            "title": PRODUCT_NAME,
            "quantity": 1,
            "unit_price": price_local,
            "currency_id": currency,  # ARS / BRL
        }],
        "payer": {"email": email},
        "back_urls": {
            "success": f"{BASE_URL}/checkout.html?status=success",
            "failure": f"{BASE_URL}/checkout.html?status=failure",
            "pending": f"{BASE_URL}/checkout.html?status=pending",
        },
        "auto_return": "approved",
        "external_reference": email,
        # El país viaja en el webhook para resolver el token correcto al verificar.
        "notification_url": f"{BASE_URL}/api/payments/webhook/mercadopago?country={country}",
    }
    # En Brasil, Pix es el medio fuerte: MP Brasil lo ofrece nativo en Checkout Pro.
    try:
        resp = sdk.preference().create(preference)
        body = resp["response"]
        return {"checkout_url": body["init_point"], "sandbox": False}
    except Exception as e:
        log.error("MP checkout error: %s", e)
        return JSONResponse({"error": "No se pudo crear el checkout"}, status_code=502)


@router.post("/webhook/mercadopago")
async def mp_webhook(request: Request):
    """MP notifica un pago; verificamos su estado real contra la API antes de activar."""
    try:
        import mercadopago
    except ImportError:
        return JSONResponse({"error": "unavailable"}, status_code=503)
    # El país viene en la query (lo puso notification_url) para elegir el token correcto.
    country = (request.query_params.get("country") or "AR").upper()
    token, _, _ = _mp_creds(country)
    if not token:
        token = (os.getenv("MP_ACCESS_TOKEN_AR") or os.getenv("MP_ACCESS_TOKEN_BR")
                 or os.getenv("MP_ACCESS_TOKEN"))
    if not token:
        return JSONResponse({"error": "unavailable"}, status_code=503)
    sdk = mercadopago.SDK(token)
    try:
        body = await request.json()
    except Exception:
        body = {}
    payment_id = (
        request.query_params.get("data.id")
        or request.query_params.get("id")
        or (body.get("data") or {}).get("id")
        or body.get("id")
    )
    if not payment_id:
        return {"received": True}
    try:
        pay = sdk.payment().get(payment_id)["response"]
        if pay.get("status") == "approved":
            email = pay.get("external_reference")
            if email:
                _upgrade_to_pro(email)
    except Exception as e:
        log.error("MP webhook verify error: %s", e)
    return {"received": True}

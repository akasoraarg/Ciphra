"""
Helpers de seguridad para Ciphra COMMANDER.

Incluye:
  - Rate limiting in-memory (por IP, sin dependencias externas).
  - Sanitización / validación de inputs (safe_json, sanitize_str, validate_email).
  - Hashing de contraseñas con PBKDF2 salteado (+ verificación de hashes legados).
  - Generación de tokens de sesión seguros.
  - SecureStaticFiles: handler estático endurecido que NO expone código ni secretos.

Diseñado para una app single-process con storage en archivos JSON. El rate limiting
es en memoria, por lo que no sobrevive reinicios ni se comparte entre múltiples
workers (ver SECURITY_AUDIT.md).
"""

import os
import re
import time
import json
import hmac
import hashlib
import secrets
from collections import defaultdict, deque

from fastapi import Request, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response


# ---------------------------------------------------------------------------
# Rate limiting (in-memory, por IP)
# ---------------------------------------------------------------------------
GLOBAL_LIMIT = (100, 60)    # 100 solicitudes / 60s por IP en /api/*
AUTH_LIMIT = (5, 900)       # 5 intentos / 15 min por IP en rutas de auth

_global_buckets = defaultdict(deque)
_auth_buckets = defaultdict(deque)


def _check(store, key, limit, window, now=None):
    """Devuelve (permitido: bool, retry_after_segundos: int)."""
    now = time.monotonic() if now is None else now
    dq = store[key]
    boundary = now - window
    while dq and dq[0] <= boundary:
        dq.popleft()
    if len(dq) >= limit:
        retry_after = int(window - (now - dq[0])) + 1
        return False, max(retry_after, 1)
    dq.append(now)
    return True, 0


def check_global(ip):
    return _check(_global_buckets, ip, *GLOBAL_LIMIT)


def check_auth(ip):
    return _check(_auth_buckets, ip, *AUTH_LIMIT)


# ---------------------------------------------------------------------------
# Sanitización / validación de inputs
# ---------------------------------------------------------------------------
# Elimina caracteres de control excepto tab (9), LF (10) y CR (13).
_CONTROL_CHARS = {c: None for c in range(0, 32) if c not in (9, 10, 13)}
_CONTROL_CHARS[127] = None  # DEL

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MAX_JSON_BYTES = 256 * 1024  # 256 KB por defecto para cuerpos JSON


class ValidationError(ValueError):
    """Error de validación de input: el caller debe responder 400/422."""
    pass


def sanitize_str(value, max_len=2000, field="campo", allow_empty=True, strip=True):
    """Normaliza un string de usuario; lanza ValidationError si es inválido."""
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError(f"{field} inválido")
    if strip:
        value = value.strip()
    value = value.translate(_CONTROL_CHARS)
    if not allow_empty and not value:
        raise ValidationError(f"{field} requerido")
    if len(value) > max_len:
        raise ValidationError(f"{field} excede el largo máximo ({max_len})")
    return value


def validate_email(email, max_len=254):
    email = sanitize_str(email, max_len=max_len, field="email", allow_empty=False).lower()
    if not _EMAIL_RE.match(email):
        raise ValidationError("Email malformado")
    return email


def clamp_int(value, default, lo, hi):
    """Convierte a int y lo acota a [lo, hi]; usa default si no es convertible."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


async def safe_json(request: Request, max_bytes=MAX_JSON_BYTES):
    """
    Lee y parsea el cuerpo JSON con límite de tamaño y manejo de errores.
      - 413 si excede max_bytes (por Content-Length o por tamaño real).
      - 400 si el JSON está malformado o no es un objeto.
    """
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > max_bytes:
                raise HTTPException(status_code=413, detail="Cuerpo demasiado grande")
        except ValueError:
            raise HTTPException(status_code=400, detail="Content-Length inválido")
    body = await request.body()
    if len(body) > max_bytes:
        raise HTTPException(status_code=413, detail="Cuerpo demasiado grande")
    if not body:
        return {}
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="JSON malformado")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Se esperaba un objeto JSON")
    return data


# ---------------------------------------------------------------------------
# Hashing de contraseñas (PBKDF2-HMAC-SHA256 salteado, stdlib)
# ---------------------------------------------------------------------------
PBKDF2_ITERATIONS = 200_000
_HEX_RE = re.compile(r"^[0-9a-f]{64}$")


def hash_password(password):
    if not isinstance(password, str) or not password:
        raise ValidationError("Contraseña inválida")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def _verify_pbkdf2(password, stored):
    try:
        _algo, iters, salt_hex, hash_hex = stored.split("$")
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iters))
    except Exception:
        return False
    return hmac.compare_digest(dk, expected)


_COMMON_PASSWORDS = {
    "password", "12345678", "123456789", "1234567890", "qwerty123", "password1",
    "password123", "11111111", "00000000", "iloveyou", "admin123", "contraseña",
    "qwertyuiop", "1q2w3e4r", "abc12345", "letmein123", "ciphra123", "12345678910",
}

def is_weak_password(password) -> bool:
    """True si la contraseña es trivial (común, un solo carácter repetido, o secuencia)."""
    if not isinstance(password, str):
        return True
    p = password.strip().lower()
    if p in _COMMON_PASSWORDS:
        return True
    if len(set(p)) <= 2:  # 'aaaaaaaa', 'ababab', etc.
        return True
    return False


def verify_password(password, stored):
    """
    Verifica una contraseña. Devuelve (ok, needs_upgrade).
    needs_upgrade=True cuando el hash almacenado es legado (sha256 sin sal) y debe
    re-hashearse tras un login exitoso.
    """
    if not stored or not isinstance(stored, str) or not isinstance(password, str):
        return False, False
    if stored.startswith("pbkdf2_sha256$"):
        return _verify_pbkdf2(password, stored), False
    # Legado: sha256 hex sin sal (64 hex chars)
    if _HEX_RE.match(stored.lower()):
        legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
        ok = hmac.compare_digest(legacy, stored.lower())
        return ok, ok
    return False, False


# ---------------------------------------------------------------------------
# Tokens de sesión
# ---------------------------------------------------------------------------
def generate_token():
    return "ctk_" + secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# Static files endurecido
# ---------------------------------------------------------------------------
# Whitelist de extensiones servibles (assets de front). Cualquier otra cosa -> 404.
_ALLOWED_STATIC_EXT = {
    ".html", ".htm", ".css", ".js", ".mjs", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif",
    ".woff", ".woff2", ".ttf", ".otf",
}


class SecureStaticFiles(StaticFiles):
    """
    StaticFiles que evita exponer código fuente, datos y secretos:
      - 404 para dotfiles / segmentos de ruta ocultos (p.ej. .env).
      - 404 para cualquier extensión fuera de la whitelist de assets
        (bloquea .py, .json, .bak, .encrypted_backup, .dmg, .txt, etc.).
    """

    async def get_response(self, path, scope):
        parts = [p for p in path.split("/") if p]
        # Bloquear dotfiles reales (.env, .git…) pero permitir "." (raíz) y ".." (StaticFiles ya frena traversal).
        if any(p.startswith(".") and p not in (".", "..") for p in parts):
            return Response("Not Found", status_code=404)
        ext = os.path.splitext(path)[1].lower()
        # Rutas sin extensión (raíz / directorios) las maneja StaticFiles (index.html).
        if ext and ext not in _ALLOWED_STATIC_EXT:
            return Response("Not Found", status_code=404)
        return await super().get_response(path, scope)

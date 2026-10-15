"""Supabase Auth transport. Provider tokens never reach browser storage."""
import os
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


def provider():
    value = os.getenv("AUTH_PROVIDER", "supabase").lower()
    if value not in {"supabase", "local"}:
        raise RuntimeError("AUTH_PROVIDER must be supabase or local")
    return value


def settings():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
    parsed = urlparse(url)
    local = parsed.hostname in {"localhost", "127.0.0.1"}
    if not key or not parsed.netloc or (parsed.scheme != "https" and not (local and parsed.scheme == "http")):
        raise HTTPException(503, "La autenticación no está configurada.")
    return url, key


async def authenticate(action, data):
    url, key = settings()
    params = {}
    if action == "signup":
        base = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
        if not base:
            raise HTTPException(503, "Falta configurar la URL pública.")
        path = "signup"
        params["redirect_to"] = base + "/login.html"
    else:
        path = "token"
        params["grant_type"] = action
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{url}/auth/v1/{path}", params=params,
                headers={"apikey": key}, json=data,
            )
    except httpx.RequestError:
        raise HTTPException(503, "No se pudo conectar con el servicio de autenticación.") from None
    if response.status_code >= 400:
        if response.status_code == 429:
            raise HTTPException(429, "Demasiados intentos. Probá de nuevo más tarde.")
        if response.status_code >= 500:
            raise HTTPException(503, "Servicio de autenticación no disponible.")
        raise HTTPException(400 if action == "signup" else 401,
                            "No se pudo registrar la cuenta." if action == "signup" else
                            "Credenciales inválidas o email sin confirmar.")
    try:
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except ValueError:
        raise HTTPException(502, "Respuesta de autenticación inválida.") from None

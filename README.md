# Ciphra

## Estructura

```
backend/            API FastAPI
  main.py           App principal y rutas (chats, amigos, MindShift, Quantum, región…)
  auth_api.py       Auth con Supabase
  payments_api.py   Pagos (link MP, transferencia, Stripe, Mercado Pago)
  security.py       Rate limiting, validación, static files seguros
  ciphra_encrypter.py
frontend/           Todo lo que sirve el navegador (montado en "/")
  *.html            Páginas (index, login, commander, mindshift, quantum…)
  css/              Estilos
  js/               Scripts de las páginas
  assets/           Imágenes (favicon)
desktop/            App de macOS (pywebview) y script de build del .dmg
scripts/            Migraciones y utilidades de datos
  legacy/           Parches viejos ya aplicados, se dejan como referencia
tests/              Tests de Python y JS
```

Los datos locales (`users.json`, `chats.json`, `sessions.json`, …), el `.env` y `Ciphra.dmg` siguen en la raíz del repo.

## Correr en local

```bash
cp .env.example .env   # completar valores
pip install -r requirements.txt
uvicorn main:app --app-dir backend --reload
```

Abrir http://localhost:8000

## Tests

```bash
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/auth.test.js
```

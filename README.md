# Ciphra

## Web setup

Use Python 3.12 and run from the repository root:

```sh
python -m venv venv
. venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `VAULT_KEY` and `CIPHRA_BASE_KEY` to separate, stable random secrets (for example,
run `python -c "import secrets; print(secrets.token_urlsafe(48))"` for each).
Existing encrypted data requires its original keys. If `GEMINI_API_KEY` is set,
it takes precedence over `CIPHRA_BASE_KEY`; do not change it without migrating
existing encrypted files. AI keys are optional for testing authentication.

## Supabase Auth

1. Create/select a Supabase project. In Project Settings > API Keys, copy the
   project URL to `SUPABASE_URL` and the publishable key to
   `SUPABASE_PUBLISHABLE_KEY`. Legacy `SUPABASE_ANON_KEY` is also supported.
   Keep `AUTH_PROVIDER=supabase`. No service-role key or database migration is
   needed for this Auth integration.
2. Set `PUBLIC_BASE_URL` to the site's exact HTTPS origin in production, and
   `ALLOWED_ORIGINS` to the same origin. Serve the frontend and API together.
3. Under Authentication > URL Configuration, set Site URL to that origin and
   add `https://YOUR-DOMAIN/login.html` to Redirect URLs. For development, use
   `http://localhost:8000` and `http://localhost:8000/login.html`.
4. Enable the Email provider and email confirmations. Configure production SMTP
   and sender details in Supabase before launch; its default email service is
   intended for testing. The signup screen asks users to confirm their email,
   then sign in. It does not create an application session before confirmation.
5. Optional Google login: create a Google OAuth Web client, add the site's origin
   to Authorized JavaScript origins, and enable Google in Supabase with the same
   client ID and secret. Use Supabase's displayed callback URL in Google's
   Authorized redirect URIs. Set `GOOGLE_CLIENT_ID` in Ciphra to that Web client ID.
   Google is hidden/disabled when this value is absent. Ciphra sends the signed
   Google credential to Supabase for verification.

Start the web app (the deployment Procfile uses the platform's `PORT`):

```sh
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open `/login.html`, register a new account, confirm its email, sign in, reload
Commander, and log out. Verify that revisiting Commander redirects to login.
A new account has the Free plan; plans never come from Supabase user metadata.

### Storage and migration

Supabase manages account credentials and confirmation. Ciphra still stores
profiles, plans, chats, payments and its own 30-day sessions in encrypted local
JSON files. Deploy **one worker/instance with a persistent writable working
directory**, retain the encryption keys, and back up the data. An ephemeral or
multi-instance deployment needs a separate database migration before launch.
The Ciphra API does not return or store Supabase tokens. The login page removes
confirmation-link fragments supplied by Supabase. Ciphra logout revokes its own
session. Revoking/deleting an account in Supabase does not revoke an
already-issued Ciphra session; remove its entries from `sessions.json` using
application-aware tooling or wait for its 30-day expiry.

Existing local password hashes are not automatically imported into Supabase.
Migrate/invite those users through Supabase before switching. Verified matching
emails retain their existing Ciphra profile and plan; subsequent logins are bound
to the Supabase user ID. Switching providers invalidates old application sessions.
`AUTH_PROVIDER=local` explicitly enables the legacy password store for local
recovery/development; it never enables unsigned Google login.

## Auth verification

```sh
python -m unittest discover -s tests -p 'test_auth*.py'
node --test tests/auth.test.js
```

Tests use synthetic users and mocked Supabase HTTP responses; live email delivery
and Google OAuth must also be verified against the configured project.

## Frontend loading

Pages remain independent HTML routes. `ui-loading.js` / `ui-loading.css` provide
layout skeletons with `aria-busy`, reduced-motion support, cleanup and retry states.
Wrap async view operations with `PageUI.run` or `PageUI.wrap`; authentication uses
`data-auth-loading` / `data-skeleton` regions. Background polling retains content.

Markdown, math and diagrams load through `ui-rich.js` only when needed. Commander
renders 20 recent messages; “Cargar mensajes anteriores” adds earlier history
through `ui-history.js`. The existing API still returns one complete chat payload.
Landing WebGL modules load near the viewport during idle time and skip reduced
motion/data-saving sessions. Quiz logic starts on form interaction; legal content
and the diagram editor load only on their routes. Rendered images use native lazy
loading and asynchronous decoding. No bundler or new runtime dependencies are required.

For browser helper regressions, open `/login.html` in the shared development
browser and run `coderabbit-agent-browser eval --stdin < tests/ui.browser.js`.
The check exercises nested loads, DOM replacement, rejected tasks, retry controls,
preserved form inputs and the absence of eager rich-renderer scripts.

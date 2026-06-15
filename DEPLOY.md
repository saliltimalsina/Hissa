# Hissa — Deploy (free tier)

Backend → **Fly.io** (FastAPI). Database → **Neon** (free Postgres). Frontend → **Vercel** (free).
The browser only ever talks to the Vercel domain; `/api/*` is rewritten to the Fly app
(`frontend/vercel.json`), so the app and API are same-origin and the auth cookie works.

## 1. Provision a free Postgres (Neon)
1. Sign up at https://neon.tech → create a project (region close to users).
2. Copy the **pooled** connection string: `postgresql://USER:PASS@HOST/DB?sslmode=require`.

## 2. Backend on Fly
```sh
cd BulkCLI
fly auth login                       # interactive, opens browser
fly launch --no-deploy --copy-config --name hissa-api   # registers app from fly.toml
```

Set secrets (NEVER commit these). Generate fresh JWT_SECRET / ENCRYPTION_KEY with
`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`:
```sh
fly secrets set \
  DATABASE_URL="postgresql://...neon..." \
  JWT_SECRET="<48+ random chars>" \
  ENCRYPTION_KEY="<48+ random chars, DIFFERENT from JWT_SECRET>" \
  FRONTEND_URL="https://hissa.vercel.app" \
  ALLOWED_ORIGINS="https://hissa.vercel.app" \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_PORT="465" \
  SMTP_USER="salil.timalsina@gmail.com" \
  SMTP_PASSWORD="<gmail app password>" \
  SMTP_FROM_NAME="Hissa"
```
Then deploy (remote build — no local Docker needed):
```sh
fly deploy --remote-only
```
Health check `/api/brokers` should go green. App URL: `https://hissa-api.fly.dev`.

> **Important:** `ENCRYPTION_KEY` must never change once users store accounts — rotating it
> makes all stored MeroShare credentials undecryptable. Back it up securely.

## 3. Frontend on Vercel
`frontend/vercel.json` already rewrites `/api/*` → `https://hissa-api.fly.dev`.
If the Fly app name differs, update that destination. Push to the branch Vercel builds, or:
```sh
cd frontend && vercel --prod
```

## 4. Post-deploy verification (do these in order)
1. `curl https://hissa-api.fly.dev/api/brokers` → JSON (public, confirms app up).
2. On `https://hissa.vercel.app`: sign up → confirm you land logged in.
   - **Open DevTools → Application → Cookies.** You MUST see `hissa_session` (HttpOnly) and
     `hissa_csrf` set for the vercel.app domain. If they're missing, Vercel isn't forwarding
     `Set-Cookie` through the rewrite — see Troubleshooting.
3. Add a MeroShare account → it should persist after reload (stored server-side).
4. Log out → confirm protected pages bounce to login.
5. Forgot password → check the reset email arrives → reset → log in with new password.

## Troubleshooting
- **Not staying logged in after signup/login:** the `Set-Cookie` from Fly isn't reaching the
  browser through the Vercel rewrite. Verify in DevTools (step 2). Fix options: confirm the
  rewrite destination is correct and https; or move the API to a subdomain of the same site
  (e.g. `api.hissa.app`) with the app at `hissa.app` and set the cookie `Domain=.hissa.app`.
- **500 on first request:** check `fly logs`. A missing `JWT_SECRET`/`ENCRYPTION_KEY` makes the
  app refuse to start by design (fail-closed) — set the secrets.
- **Reset emails not sending:** Gmail requires an *app password* (not your account password),
  and 2FA must be on. Check `fly logs` for SMTP errors.

## Env var reference
| Var | Required | Purpose |
|-----|----------|---------|
| `DATABASE_URL` | yes (prod) | Postgres connection string. Its presence = "production" mode. |
| `JWT_SECRET` | yes (prod) | Signs session JWTs. App won't start without it in prod. |
| `ENCRYPTION_KEY` | yes (prod) | Derives per-user keys for MeroShare credential encryption. |
| `FRONTEND_URL` | recommended | Base URL used in password-reset links. |
| `ALLOWED_ORIGINS` | recommended | Comma-separated CORS allowlist (in addition to FRONTEND_URL). |
| `SMTP_USER` / `SMTP_PASSWORD` | for reset emails | Gmail address + app password. |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM_NAME` | optional | Defaults: smtp.gmail.com / 465 / Hissa. |
| `APP_ENV` | optional | Set to `dev` to allow insecure defaults when testing against a remote DB. |
</content>

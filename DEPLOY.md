# Hissa — Deploy (free tier: Vercel + Neon)

**One** Vercel project, **same origin** for the frontend and the API:

- **Frontend** — static Vite build in `frontend/` (`npm run build` → `frontend/dist`),
  served from Vercel's CDN.
- **API** — the FastAPI app (`BulkCLI/server.py`) runs as a **Vercel Python function**.
  Entry point: `api/index.py` (puts `BulkCLI/` on `sys.path` and re-exports `app`).
  All `/api/*` requests are routed to it, **preserving the original path**, so the
  app's own routes (`/api/auth/login`, `/api/brokers`, …) match unchanged.
- **Database** — **Neon** Postgres (free, auto-resumes from idle). Use the **pooled**
  connection string; the engine uses SQLAlchemy `NullPool` for serverless safety.
- **Automation** — a **Vercel Cron** (daily, free on Hobby).

Because the browser only ever talks to one origin, the `Set-Cookie` auth cookie
(`hissa_session`, SameSite=strict) just works — this is the whole point of the
same-origin design, and it eliminates the old cross-domain "not staying logged in"
bug from the Fly setup.

Config lives in the **root** `vercel.json`. The Vercel project **Root Directory must
be the repo root** (it was previously `frontend/` — change it, see step 3).

---

## 1. Provision Postgres (Neon)

1. Sign up at https://neon.tech → **New Project** (any region; Neon free tier auto-suspends
   when idle and resumes on the next connection).
2. In the project's **Connection Details**, toggle **Pooled connection** and copy the
   string. It looks like:
   `postgresql://USER:PASS@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require`
   — note the `-pooler` host segment. **Use the pooled one** (works with NullPool +
   serverless). The app injects `sslmode=require` if it's missing, but Neon's string
   already includes it.

> The schema is created automatically on the first cold start (`init_db()` in the
> FastAPI lifespan; `create_all` is idempotent). No manual migration step.

## 2. Generate secrets

Two **separate** secrets (never reuse one for both):

```sh
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # ENCRYPTION_KEY (run again, different value)
```

> **Critical:** `ENCRYPTION_KEY` must NEVER change once users store accounts — rotating it
> makes every stored MeroShare credential undecryptable. Back it up securely.

## 3. Point the Vercel project at the repo root

The existing project (`hissa`) is linked with Root Directory = `frontend`. Change it:

- **Dashboard:** Project → **Settings → Build & Deployment → Root Directory** → set to
  empty / repo root → Save. (Or **Settings → General → Root Directory**.)
- Then re-link your local checkout to the root:

```sh
cd "/Users/saliltimalsina/Desktop/Personal/Bulk IPO"
vercel login            # interactive
vercel link             # pick the existing "hissa" project; confirm root directory = ./
```

This rewrites `.vercel/repo.json` so `directory` is the repo root instead of `frontend`.

## 4. Set environment variables

Set each for the **Production** environment (repeat with `preview` if you use preview deploys):

```sh
vercel env add DATABASE_URL production       # paste the Neon POOLED string
vercel env add JWT_SECRET production         # paste generated value #1
vercel env add ENCRYPTION_KEY production     # paste generated value #2 (different!)
vercel env add FRONTEND_URL production       # e.g. https://hissa.vercel.app
vercel env add ALLOWED_ORIGINS production    # e.g. https://hissa.vercel.app
# Optional — only if password-reset emails are wanted:
vercel env add SMTP_HOST production          # smtp.gmail.com
vercel env add SMTP_PORT production          # 465
vercel env add SMTP_USER production          # gmail address
vercel env add SMTP_PASSWORD production       # gmail APP password (not account pw; 2FA must be on)
vercel env add SMTP_FROM_NAME production      # Hissa
```

> `DATABASE_URL` being present is what flips the app into "production" mode (fail-closed
> on missing `JWT_SECRET`/`ENCRYPTION_KEY`, Secure cookies). Env vars are baked at build
> time, so **redeploy after changing any of them**.

## 5. Deploy

```sh
cd "/Users/saliltimalsina/Desktop/Personal/Bulk IPO"
vercel --prod
```

(Or push to the branch Vercel builds from.) Vercel will run
`cd frontend && npm install && npm run build`, publish `frontend/dist`, and bundle the
Python function (`api/index.py` + `BulkCLI/**` via `includeFiles`) on Python 3.12.

## 6. Post-deploy verification (in order)

1. `curl https://<your-app>.vercel.app/api/brokers` → JSON array (public route, confirms
   the function is live and routing/path-preservation works).
2. Open the app → sign up → confirm you land logged in. In **DevTools → Application →
   Cookies** you must see `hissa_session` (HttpOnly) and `hissa_csrf` for the app's
   domain. Same-origin → these are set directly, no cross-domain hop.
3. Add a MeroShare account → reload → it persists (stored encrypted server-side).
4. Log out → protected pages bounce to login.
5. (If SMTP set) Forgot password → reset email arrives → reset → log in.
6. Confirm the cron exists: Project → **Settings → Cron Jobs** shows the daily
   `0 3 * * *` hit on `/api/brokers` (a harmless placeholder — see note below).

## Troubleshooting

- **500 on first request:** check **Vercel → Deployments → (latest) → Functions** logs.
  A missing `JWT_SECRET`/`ENCRYPTION_KEY` makes the app fail-closed by design — set them
  and redeploy.
- **`/api/*` returns the SPA HTML instead of JSON:** Root Directory isn't the repo root
  (Vercel is reading the old `frontend/` config). Fix Root Directory (step 3), redeploy.
- **DB connection / "too many connections":** make sure you used the **pooled** Neon
  string (`-pooler` host). NullPool + pgbouncer pooling is the intended combo.
- **Reset emails not sending:** Gmail needs an *app password* and 2FA enabled.

## Cron note

`vercel.json` registers a daily cron hitting `/api/brokers` (a public, side-effect-free
endpoint) purely as a placeholder/keepalive. When a real scheduled-apply / automation
endpoint exists, point the cron's `path` at it and adjust the `schedule`.

## Env var reference

| Var | Required | Purpose |
|-----|----------|---------|
| `DATABASE_URL` | yes (prod) | Neon **pooled** Postgres string. Its presence = "production" mode. |
| `JWT_SECRET` | yes (prod) | Signs session JWTs. App won't start without it in prod. |
| `ENCRYPTION_KEY` | yes (prod) | Derives per-user keys for MeroShare credential encryption. Never rotate. |
| `FRONTEND_URL` | recommended | Base URL used in password-reset links + a default CORS origin. |
| `ALLOWED_ORIGINS` | recommended | Comma-separated CORS allowlist (added to FRONTEND_URL). Same-origin so mostly for local/dev. |
| `SMTP_USER` / `SMTP_PASSWORD` | for reset emails | Gmail address + app password. |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM_NAME` | optional | Defaults: smtp.gmail.com / 465 / Hissa. |
| `APP_ENV` | optional | Set to `dev` to allow insecure defaults when testing against a remote DB locally. |

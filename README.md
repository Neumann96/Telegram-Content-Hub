# Telegram Content Hub

MVP web service for monitoring public Telegram channels, editing posts, and publishing prepared content into target Telegram channels.

## Stack

- Frontend: Next.js, TypeScript, Tailwind, shadcn/ui-style primitives, React Query, Zustand.
- Backend: Go, Gin, GORM, PostgreSQL.
- Telegram worker: Python, Telethon.
- Media storage: MinIO.
- Infra: Docker Compose.

## Repository Layout

```text
apps/
  api/      Go API, migrations, domain models
  web/      Next.js operator UI
  worker/   Telethon monitoring worker
infra/      Future deployment and local infra assets
```

## Foundation Setup

1. Copy environment defaults:

   ```bash
   cp .env.example .env
   ```

2. Fill Telegram credentials in `.env` when they are available:

   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_LOGIN_BOT_USERNAME`
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`

3. Start local services:

   ```bash
   docker compose up --build
   ```

4. Open:

   - Web: http://localhost:3000
   - API health: http://localhost:8080/api/health
   - MinIO console: http://localhost:9001

## Data Model

Foundation creates the SaaS-ready base entities:

- `users`
- `telegram_accounts`
- `sources`
- `posts`
- `media`
- `publish_tasks`

Every tenant-owned entity includes `user_id`. Posts store both `raw_text` and `telegram_entities` JSONB so Telegram formatting is not reduced to Markdown.

## Current Scope

Foundation provides runnable service shells, Docker Compose, PostgreSQL and MinIO wiring, initial DB migrations, base API routes, and the three-column frontend shell.

Phase 1 now adds the first end-to-end content loop:

- Telegram Login endpoint.
- Adding public channels by `@username`.
- Worker-side channel metadata validation through Telethon.
- Worker-side ingestion of latest and new posts.
- Post search and filters by source/date/status.
- Draft editing with `raw_text` plus `telegram_entities` JSON.
- Media metadata operations for add, remove, reorder, and replace flows.
- Publish task queue for Telegram Bot API text, photo, and media group publishing.

## API Notes

During MVP development, authenticated API routes use `X-User-ID` when provided. If it is missing, the API creates and uses a development user. This keeps the data model tenant-ready while allowing local development before session management is added.

Important endpoints:

- `POST /api/auth/telegram`
- `GET /api/sources`
- `POST /api/sources`
- `GET /api/posts`
- `PATCH /api/posts/:id/draft`
- `POST /api/posts/ingest`
- `POST /api/publish_tasks`

## Worker Notes

The worker uses one technical Telegram account for public-channel monitoring. Configure:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_WORKER_SESSION`
- `TELEGRAM_BOT_TOKEN`

The first Telethon session authorization is interactive when run locally. For production, create the session file once and mount it into the worker container.

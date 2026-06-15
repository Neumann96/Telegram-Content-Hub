# Changelog

## 0.2.0 - Phase 1 MVP Flow

- Added Telegram Login endpoint with hash validation when bot token is configured.
- Added source channel API for adding, listing, and updating public Telegram sources.
- Added post listing with channel, date, status, and search filters.
- Added post ingestion endpoint for Telethon worker messages with raw text and Telegram entities JSON.
- Added draft saving endpoint for edited text and post status changes.
- Added media metadata endpoints for add, update, reorder, replace, and delete flows.
- Added publish task queue endpoints for Bot API publishing.
- Extended Telethon worker to validate channel metadata, ingest latest/new posts, and process publish tasks.
- Connected the Next.js workspace to real sources, posts, draft saving, filters, and publish task creation.

## 0.1.0 - Foundation

- Initialized monorepo layout for API, web app, worker, and infrastructure.
- Added Docker Compose with PostgreSQL, MinIO, Go API, Next.js web, and Telethon worker services.
- Added PostgreSQL migration for users, telegram accounts, sources, posts, media, and publish tasks.
- Added Go API foundation with health and bootstrap routes.
- Added Next.js three-column workspace shell.
- Added Telethon worker foundation with API readiness check and idle mode.
- Added roadmap and setup documentation.

# Roadmap

## Phase 1

- Telegram Login. Initial endpoint implemented.
- Adding public Telegram channels by `@username`. Initial API/UI implemented.
- Channel validation and fetching latest posts before connecting. Worker metadata refresh and initial ingestion implemented.
- Channel monitoring with one technical Telethon account. Polling worker implemented.
- Post parsing. Raw text and entities ingestion implemented.
- Telegram Markdown support. Draft text and Bot API parse mode foundation implemented.
- Modern Telegram entities support:
  - bold
  - italic
  - underline
  - strikethrough
  - spoiler
  - blockquote
  - expandable blockquote
  - code
  - links
  - custom emoji
  - other Telegram entities.
- Text editing. Draft save implemented.
- Image editing:
  - add images
  - remove images
  - reorder images
  - replace images.
- Draft saving. Implemented.
- Publishing through Telegram Bot API. Queue and worker implemented:
  - text
  - images
  - media groups.
- Search.
- Filtering by channel and date.

## Phase 2

- Scheduled posting.
- Cross-posting into multiple channels.
- Change history.
- Tags.

## Phase 3

- AI rewrite.
- AI translation.
- Automatic rules.
- Team collaboration.

## Phase 4

- Connecting user Telegram accounts.
- Private channel support.
- SaaS hardening.
- Subscriptions.
- Billing.
- Public API.

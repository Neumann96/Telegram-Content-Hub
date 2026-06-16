# Telegram Content Hub

Веб-сервис для мониторинга публичных Telegram-каналов, редактирования найденных постов и публикации подготовленного контента в целевые Telegram-каналы.

Проект находится на стадии Phase 1 MVP: базовый контур уже собирается и запускается через Docker Compose, API хранит данные в PostgreSQL, воркер работает с Telegram через Telethon, а веб-интерфейс подключен к реальным API-эндпоинтам.

## Что уже есть

- Вход через Telegram Login Widget. По умолчанию фронтенд использует тестового login-бота `@pasechnikov_bot`, если backend не отдал своего бота из `/api/bootstrap`.
- Добавление публичных каналов по `@username`.
- Проверка и обновление метаданных каналов через технический Telethon-аккаунт.
- Первичная загрузка и дальнейший мониторинг новых постов.
- Сохранение исходного текста и Telegram entities без потери форматирования.
- Поиск постов и фильтрация по каналу, дате и статусу.
- Редактор черновика с сохранением текста и статуса.
- Метаданные медиа для сценариев добавления, удаления, замены и сортировки изображений.
- Очередь публикации через Telegram Bot API.
- Адаптивный интерфейс для desktop, планшетов и мобильных устройств.

## Стек

- Frontend: Next.js, TypeScript, Tailwind CSS, React Query, Zustand.
- Backend: Go, Gin, GORM, PostgreSQL.
- Telegram worker: Python, Telethon.
- Media storage: MinIO.
- Infra: Docker Compose.

## Структура репозитория

```text
apps/
  api/      Go API, миграции и доменные модели
  web/      Next.js интерфейс оператора
  worker/   Telethon воркер для мониторинга и публикации
infra/      Инфраструктурные файлы для локального и будущего production-развертывания
```

## Быстрый старт

1. Скопируйте пример переменных окружения:

   ```bash
   cp .env.example .env
   ```

2. Заполните Telegram-настройки в `.env`:

   - `TELEGRAM_BOT_TOKEN` — токен бота для проверки Telegram Login и публикации.
   - `TELEGRAM_LOGIN_BOT_USERNAME` — username бота без обязательного `@`, используется виджетом входа. Для тестового контура можно использовать `pasechnikov_bot`.
   - `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` — данные Telegram API для Telethon-воркера.
   - `TELEGRAM_WORKER_SESSION` — путь к session-файлу технического Telegram-аккаунта.

3. Запустите сервисы:

   ```bash
   docker compose up --build
   ```

4. Откройте:

   - Web: http://localhost:3000
   - API health: http://localhost:8080/api/health
   - MinIO console: http://localhost:9001

## Telegram Login

Фронтенд получает имя login-бота из `GET /api/bootstrap`, рендерит Telegram Login Widget и отправляет полученный payload в `POST /api/auth/telegram`. Если backend пока не настроен, интерфейс использует тестовый `@pasechnikov_bot` и позволяет вручную сменить username бота без пересборки.

Если задан `TELEGRAM_BOT_TOKEN`, API проверяет подпись Telegram login hash. После успешного входа фронтенд сохраняет пользователя локально и отправляет его UUID в заголовке `X-User-ID` для последующих запросов.

Токен бота нельзя коммитить в репозиторий. Его нужно передавать через `.env`, переменные окружения сервера или секреты CI/CD.

Для локальной разработки API по-прежнему поддерживает fallback: если `X-User-ID` не передан, создается и используется development-user. Это упрощает запуск без полноценной сессии, но модель данных уже остается tenant-ready.

## Основные API-эндпоинты

- `GET /api/bootstrap`
- `POST /api/auth/telegram`
- `GET /api/sources`
- `POST /api/sources`
- `PATCH /api/sources/:id`
- `GET /api/posts`
- `GET /api/posts/:id`
- `PATCH /api/posts/:id/draft`
- `POST /api/posts/ingest`
- `POST /api/media`
- `PATCH /api/media/:id`
- `DELETE /api/media/:id`
- `POST /api/publish_tasks`
- `GET /api/publish_tasks/next`
- `PATCH /api/publish_tasks/:id`

## Модель данных

Базовая схема рассчитана на дальнейшее SaaS-развитие:

- `users`
- `telegram_accounts`
- `sources`
- `posts`
- `media`
- `publish_tasks`

Все сущности, принадлежащие пользователю, содержат `user_id`. Посты хранят `raw_text`, `edited_text` и `telegram_entities` в JSONB, поэтому Telegram-форматирование не сводится насильно к Markdown.

## Воркер

Воркер использует один технический Telegram-аккаунт для мониторинга публичных каналов. Он проверяет доступность API, валидирует каналы, забирает последние и новые посты, а также обрабатывает задачи публикации через Bot API.

Для первого локального запуска Telethon-сессия авторизуется интерактивно. Для production session-файл нужно создать один раз и примонтировать в контейнер воркера.

## Текущее состояние Phase 1

Phase 1 покрывает первый рабочий цикл: вход, подключение источников, мониторинг постов, редактирование черновиков, работа с медиа-метаданными и постановка публикации в очередь.

Следующие крупные этапы описаны в [ROADMAP.md](ROADMAP.md): отложенные публикации, кросс-постинг, история изменений, теги, AI-функции и SaaS-hardening.

import asyncio
import logging
from datetime import timezone
from typing import Any

import httpx
from telethon import TelegramClient
from telethon.tl.custom.message import Message

from worker.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("telegram-worker")


def api_headers() -> dict[str, str]:
    if settings.worker_token:
        return {"X-Worker-Token": settings.worker_token}
    if settings.api_user_id:
        return {"X-User-ID": settings.api_user_id}
    return {}


async def wait_for_api() -> None:
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            try:
                response = await client.get(f"{settings.api_base_url}/api/health")
                response.raise_for_status()
                logger.info("API is reachable")
                return
            except Exception as exc:
                logger.info("Waiting for API: %s", exc)
                await asyncio.sleep(3)


def serialize_entities(message: Message) -> list[dict[str, Any]]:
    entities = []
    for entity in message.entities or []:
        item = entity.to_dict()
        item.pop("_", None)
        entities.append(item)
    return entities


def serialize_message(source_id: str, channel_username: str, message: Message) -> dict[str, Any]:
    media = []
    if message.photo:
        media.append(
            {
                "kind": "photo",
                "storage_url": f"telegram://{channel_username}/{message.id}/photo",
                "sort_order": 0,
            }
        )

    return {
        "source_id": source_id,
        "source_username": channel_username,
        "telegram_message_id": message.id,
        "raw_text": message.raw_text or "",
        "telegram_entities": serialize_entities(message),
        "posted_at": message.date.astimezone(timezone.utc).isoformat() if message.date else None,
        "media": media,
    }


async def get_sources(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await client.get(f"{settings.api_base_url}/api/worker/sources", headers=api_headers())
    response.raise_for_status()
    return response.json().get("sources", [])


async def ingest_message(client: httpx.AsyncClient, source: dict[str, Any], message: Message) -> None:
    payload = serialize_message(source["id"], source["username"], message)
    response = await client.post(
        f"{settings.api_base_url}/api/worker/posts/ingest",
        headers=api_headers(),
        json=payload,
    )
    response.raise_for_status()


async def refresh_source_metadata(client: httpx.AsyncClient, telegram: TelegramClient, source: dict[str, Any]) -> None:
    entity = await telegram.get_entity(source["username"])
    payload = {
        "username": source["username"],
        "title": getattr(entity, "title", "") or "",
        "description": "",
        "telegram_channel_id": getattr(entity, "id", None),
        "last_message_id": source.get("last_message_id"),
    }
    response = await client.patch(
        f"{settings.api_base_url}/api/worker/sources/{source['id']}",
        headers=api_headers(),
        json=payload,
    )
    response.raise_for_status()


async def monitor_sources(telegram: TelegramClient) -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                sources = await get_sources(client)
                for source in sources:
                    username = source["username"]
                    await refresh_source_metadata(client, telegram, source)
                    last_message_id = source.get("last_message_id") or 0
                    limit = 5 if last_message_id else settings.initial_posts_limit
                    messages = []
                    async for message in telegram.iter_messages(username, limit=limit, min_id=last_message_id):
                        if message.id and (message.raw_text or message.media):
                            messages.append(message)
                    for message in reversed(messages):
                        await ingest_message(client, source, message)
                    if messages:
                        logger.info("Ingested %s messages from %s", len(messages), username)
            except Exception:
                logger.exception("Monitoring cycle failed")
            await asyncio.sleep(settings.poll_interval_seconds)


def bot_api_media_type(kind: str) -> str:
    if kind in {"video", "document", "animation"}:
        return kind
    return "photo"


def single_media_method(kind: str) -> tuple[str, str]:
    if kind == "video":
        return "sendVideo", "video"
    if kind == "document":
        return "sendDocument", "document"
    if kind == "animation":
        return "sendAnimation", "animation"
    return "sendPhoto", "photo"


def extract_message_id(payload: dict[str, Any]) -> int | None:
    result = payload.get("result")
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            return first.get("message_id")
    if isinstance(result, dict):
        return result.get("message_id")
    return None


async def send_publish_task(client: httpx.AsyncClient, task: dict[str, Any]) -> int | None:
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

    post = task["post"]
    media = task.get("media") or []
    text = post.get("edited_text") or post.get("raw_text") or ""
    target = task["target_channel_username"]
    bot_api = f"https://api.telegram.org/bot{settings.telegram_bot_token}"

    if len(media) > 1:
        media_group = [
            {
                "type": bot_api_media_type(item.get("kind", "photo")),
                "media": item["storage_url"],
                "caption": text if index == 0 else "",
                "parse_mode": "MarkdownV2",
            }
            for index, item in enumerate(media)
        ]
        response = await client.post(f"{bot_api}/sendMediaGroup", json={"chat_id": target, "media": media_group})
    elif len(media) == 1:
        method, field_name = single_media_method(media[0].get("kind", "photo"))
        response = await client.post(
            f"{bot_api}/{method}",
            json={"chat_id": target, field_name: media[0]["storage_url"], "caption": text, "parse_mode": "MarkdownV2"},
        )
    else:
        response = await client.post(
            f"{bot_api}/sendMessage",
            json={"chat_id": target, "text": text, "parse_mode": "MarkdownV2"},
        )
    response.raise_for_status()
    return extract_message_id(response.json())


async def process_publish_queue() -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                response = await client.get(f"{settings.api_base_url}/api/worker/publish_tasks/next", headers=api_headers())
                response.raise_for_status()
                task = response.json().get("publish_task")
                if not task:
                    await asyncio.sleep(settings.poll_interval_seconds)
                    continue
                try:
                    message_id = await send_publish_task(client, task)
                    status_payload = {"status": "completed", "error_message": "", "bot_message_id": message_id}
                except Exception as exc:
                    logger.exception("Publish task failed")
                    status_payload = {"status": "failed", "error_message": str(exc)}
                await client.patch(
                    f"{settings.api_base_url}/api/worker/publish_tasks/{task['id']}",
                    headers=api_headers(),
                    json=status_payload,
                )
            except Exception:
                logger.exception("Publish queue cycle failed")
                await asyncio.sleep(settings.poll_interval_seconds)


async def run_worker() -> None:
    await wait_for_api()

    if not settings.telegram_api_id or not settings.telegram_api_hash:
        logger.warning("TELEGRAM_API_ID and TELEGRAM_API_HASH are not configured; worker stays in idle mode")
        while True:
            await asyncio.sleep(settings.poll_interval_seconds)

    client = TelegramClient(
        settings.telegram_worker_session,
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )

    async with client:
        logger.info("Telethon technical account connected")
        await asyncio.gather(monitor_sources(client), process_publish_queue())


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()

import asyncio
import logging

import httpx
from telethon import TelegramClient

from worker.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("telegram-worker")


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
        # Foundation only: channel subscription and post ingestion endpoints are added in Phase 1.
        while True:
            await asyncio.sleep(settings.poll_interval_seconds)


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()

"""HTTP transport for Syntra SDK."""

import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from syntra.transport.base import BaseTransport


class HttpTransport(BaseTransport):
    """HTTP transport - sends telemetry directly to control plane API."""

    def __init__(
        self,
        url: str,
        public_key: str,
        project_id: str,
        timeout: float = 30.0,
        max_batch_size: int = 100,
        max_retries: int = 3,
        debug: bool = False,
    ) -> None:
        super().__init__(
            url=url,
            public_key=public_key,
            project_id=project_id,
            timeout=timeout,
            max_batch_size=max_batch_size,
            max_retries=max_retries,
            debug=debug,
        )
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def send_payload(
        self, payload_type: str, payload: list[dict[str, Any]]
    ) -> None:
        """Send payload via HTTP POST."""
        client = await self._get_client()
        endpoint = f"{self.url}/{payload_type}"

        body = {
            "batch_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            payload_type: payload,
        }

        response = await client.post(
            endpoint,
            json=body,
            headers={
                "Content-Type": "application/json",
                "X-Syntra-Key": self.public_key,
                "X-Syntra-Project": self.project_id,
            },
        )

        if response.status_code >= 400:
            raise Exception(f"HTTP {response.status_code}: {response.text}")

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


def create_http_transport(
    host: str,
    public_key: str,
    project_id: str,
    timeout: float = 30.0,
    debug: bool = False,
) -> HttpTransport:
    """Create HTTP transport from DSN components."""
    protocol = "http" if "localhost" in host or "127.0.0.1" in host else "https"
    url = f"{protocol}://{host}/api/v1/telemetry"

    return HttpTransport(
        url=url,
        public_key=public_key,
        project_id=project_id,
        timeout=timeout,
        debug=debug,
    )

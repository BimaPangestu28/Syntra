"""OTLP transport for Syntra SDK."""

from typing import Any

import httpx

from syntra.transport.base import BaseTransport
from syntra.types import SpanKind, SpanStatusCode


class OtlpTransport(BaseTransport):
    """OTLP transport - sends telemetry to local agent via OpenTelemetry Protocol."""

    def __init__(
        self,
        url: str,
        project_id: str,
        service_name: str = "unknown-service",
        service_version: str = "0.0.0",
        timeout: float = 30.0,
        max_batch_size: int = 100,
        debug: bool = False,
    ) -> None:
        super().__init__(
            url=url,
            public_key="",  # Not needed for OTLP
            project_id=project_id,
            timeout=timeout,
            max_batch_size=max_batch_size,
            debug=debug,
        )
        self.service_name = service_name
        self.service_version = service_version
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def send_payload(
        self, payload_type: str, payload: list[dict[str, Any]]
    ) -> None:
        """Send payload via OTLP HTTP/JSON."""
        client = await self._get_client()

        if payload_type == "spans":
            endpoint = f"{self.url}/v1/traces"
            body = {"resource_spans": [self._convert_to_resource_spans(payload)]}
        elif payload_type == "logs":
            endpoint = f"{self.url}/v1/logs"
            body = {"resource_logs": [self._convert_to_resource_logs(payload)]}
        elif payload_type == "errors":
            endpoint = f"{self.url}/v1/logs"
            body = {"resource_logs": [self._convert_errors_to_resource_logs(payload)]}
        else:
            raise ValueError(f"Unknown payload type: {payload_type}")

        response = await client.post(
            endpoint,
            json=body,
            headers={"Content-Type": "application/json"},
        )

        if response.status_code >= 400:
            raise Exception(f"OTLP {response.status_code}: {response.text}")

    def _convert_to_resource_spans(self, spans: list[dict[str, Any]]) -> dict[str, Any]:
        """Convert Syntra spans to OTLP ResourceSpans."""
        otlp_spans = []
        for span in spans:
            otlp_span = {
                "trace_id": span["trace_id"],
                "span_id": span["span_id"],
                "name": span["operation_name"],
                "kind": self._span_kind_to_number(span["span_kind"]),
                "start_time_unix_nano": str(span["start_time_ns"]),
                "end_time_unix_nano": str(span["start_time_ns"] + span["duration_ns"]),
                "attributes": self._convert_attributes(span.get("attributes", {})),
                "status": {
                    "code": self._status_code_to_number(span["status"]["code"]),
                    "message": span["status"].get("message"),
                },
                "events": [
                    {
                        "name": e["name"],
                        "time_unix_nano": str(e["timestamp_ns"]),
                        "attributes": self._convert_attributes(e.get("attributes", {})),
                    }
                    for e in span.get("events", [])
                ],
            }
            if span.get("parent_span_id"):
                otlp_span["parent_span_id"] = span["parent_span_id"]
            otlp_spans.append(otlp_span)

        return {
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"string_value": self.service_name}},
                    {"key": "service.version", "value": {"string_value": self.service_version}},
                    {"key": "syntra.project_id", "value": {"string_value": self.project_id}},
                ]
            },
            "scope_spans": [
                {
                    "scope": {"name": "syntra-sdk", "version": "0.1.0"},
                    "spans": otlp_spans,
                }
            ],
        }

    def _convert_to_resource_logs(self, logs: list[dict[str, Any]]) -> dict[str, Any]:
        """Convert Syntra logs to OTLP ResourceLogs."""
        log_records = []
        for log in logs:
            from datetime import datetime

            timestamp_ns = int(datetime.fromisoformat(log["timestamp"].rstrip("Z")).timestamp() * 1e9)
            record = {
                "time_unix_nano": str(timestamp_ns),
                "severity_number": self._level_to_severity_number(log["level"]),
                "severity_text": log["level"].upper(),
                "body": {"string_value": log["message"]},
                "attributes": self._convert_attributes(log.get("attributes", {})),
            }
            if log.get("trace_id"):
                record["trace_id"] = log["trace_id"]
            if log.get("span_id"):
                record["span_id"] = log["span_id"]
            log_records.append(record)

        return {
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"string_value": self.service_name}},
                    {"key": "service.version", "value": {"string_value": self.service_version}},
                    {"key": "syntra.project_id", "value": {"string_value": self.project_id}},
                ]
            },
            "scope_logs": [
                {
                    "scope": {"name": "syntra-sdk", "version": "0.1.0"},
                    "log_records": log_records,
                }
            ],
        }

    def _convert_errors_to_resource_logs(self, errors: list[dict[str, Any]]) -> dict[str, Any]:
        """Convert errors to OTLP logs."""
        import json
        from datetime import datetime

        log_records = []
        for error in errors:
            timestamp_ns = int(datetime.fromisoformat(error["timestamp"].rstrip("Z")).timestamp() * 1e9)
            log_records.append({
                "time_unix_nano": str(timestamp_ns),
                "severity_number": 17,  # ERROR
                "severity_text": "ERROR",
                "body": {"string_value": error["message"]},
                "attributes": [
                    {"key": "exception.type", "value": {"string_value": error["type"]}},
                    {"key": "exception.message", "value": {"string_value": error["message"]}},
                    {"key": "exception.stacktrace", "value": {"string_value": json.dumps(error["stack_trace"])}},
                ],
            })

        return {
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"string_value": self.service_name}},
                    {"key": "service.version", "value": {"string_value": self.service_version}},
                    {"key": "syntra.project_id", "value": {"string_value": self.project_id}},
                ]
            },
            "scope_logs": [
                {
                    "scope": {"name": "syntra-sdk", "version": "0.1.0"},
                    "log_records": log_records,
                }
            ],
        }

    def _convert_attributes(self, attrs: dict[str, Any]) -> list[dict[str, Any]]:
        """Convert attributes dict to OTLP format."""
        result = []
        for key, value in attrs.items():
            if isinstance(value, str):
                result.append({"key": key, "value": {"string_value": value}})
            elif isinstance(value, int):
                result.append({"key": key, "value": {"int_value": value}})
            elif isinstance(value, float):
                result.append({"key": key, "value": {"double_value": value}})
            elif isinstance(value, bool):
                result.append({"key": key, "value": {"bool_value": value}})
            else:
                result.append({"key": key, "value": {"string_value": str(value)}})
        return result

    def _span_kind_to_number(self, kind: str) -> int:
        """Convert span kind to OTLP number."""
        kinds = {
            "internal": 1,
            "server": 2,
            "client": 3,
            "producer": 4,
            "consumer": 5,
        }
        return kinds.get(kind, 0)

    def _status_code_to_number(self, code: str) -> int:
        """Convert status code to OTLP number."""
        codes = {"unset": 0, "ok": 1, "error": 2}
        return codes.get(code, 0)

    def _level_to_severity_number(self, level: str) -> int:
        """Convert log level to OTLP severity number."""
        levels = {
            "trace": 1,
            "debug": 5,
            "info": 9,
            "warn": 13,
            "error": 17,
            "fatal": 21,
        }
        return levels.get(level.lower(), 9)

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


def create_otlp_transport(
    endpoint: str,
    project_id: str,
    service_name: str = "unknown-service",
    service_version: str = "0.0.0",
    timeout: float = 30.0,
) -> OtlpTransport:
    """Create OTLP transport for local agent."""
    return OtlpTransport(
        url=endpoint,
        project_id=project_id,
        service_name=service_name,
        service_version=service_version,
        timeout=timeout,
    )

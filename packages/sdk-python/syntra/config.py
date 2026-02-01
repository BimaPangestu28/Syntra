"""Configuration and DSN parsing for Syntra SDK."""

import re
from dataclasses import dataclass


@dataclass
class ParsedDSN:
    """Parsed DSN components."""

    protocol: str
    public_key: str
    host: str
    project_id: str


def parse_dsn(dsn: str) -> ParsedDSN:
    """
    Parse a Syntra DSN string.

    Format: syn://<public_key>@<host>/<project_id>

    Args:
        dsn: The DSN string to parse

    Returns:
        ParsedDSN with extracted components

    Raises:
        ValueError: If DSN format is invalid

    Example:
        >>> parse_dsn('syn://pk_abc123@syntra.io/proj_xyz')
        ParsedDSN(protocol='syn', public_key='pk_abc123', host='syntra.io', project_id='proj_xyz')
    """
    if not dsn:
        raise ValueError("DSN is required")

    pattern = r"^(syn|https?):\/\/([^@]+)@([^\/]+)\/(.+)$"
    match = re.match(pattern, dsn)

    if not match:
        raise ValueError(
            f"Invalid DSN format. Expected: syn://<public_key>@<host>/<project_id>, got: {dsn}"
        )

    protocol, public_key, host, project_id = match.groups()

    if not public_key:
        raise ValueError("DSN missing public key")

    if not host:
        raise ValueError("DSN missing host")

    if not project_id:
        raise ValueError("DSN missing project ID")

    return ParsedDSN(
        protocol=protocol,
        public_key=public_key,
        host=host,
        project_id=project_id,
    )


def build_ingest_url(dsn: ParsedDSN) -> str:
    """Build the ingest URL from parsed DSN."""
    protocol = "https" if dsn.protocol == "syn" else dsn.protocol
    return f"{protocol}://{dsn.host}/api/v1/telemetry"


def is_valid_dsn(dsn: str) -> bool:
    """Check if DSN format is valid without throwing."""
    try:
        parse_dsn(dsn)
        return True
    except ValueError:
        return False

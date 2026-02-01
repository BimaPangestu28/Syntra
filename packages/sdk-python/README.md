# Syntra SDK for Python

Official Python SDK for Syntra - Error tracking, tracing, and observability.

## Installation

```bash
pip install syntra-sdk
```

Or with Poetry:

```bash
poetry add syntra-sdk
```

## Quick Start

```python
import syntra

# Initialize with your DSN
syntra.init(dsn="syn://pk_your_key@syntra.io/your_project")

# Capture exceptions
try:
    risky_operation()
except Exception as e:
    syntra.capture_exception(e)

# Capture messages
syntra.capture_message("User logged in", level="info")

# Set user context
syntra.set_user({"id": "user-123", "email": "user@example.com"})
```

## Configuration

```python
syntra.init(
    dsn="syn://pk_your_key@syntra.io/your_project",
    environment="production",          # Environment name
    release="1.0.0",                   # Application version
    traces_sample_rate=1.0,            # Trace sampling (0.0 - 1.0)
    errors_sample_rate=1.0,            # Error sampling (0.0 - 1.0)
    debug=False,                       # Enable debug logging
    max_breadcrumbs=100,               # Maximum breadcrumbs to keep
)
```

## Tracing

### Manual Spans

```python
# Using context manager
with syntra.start_span(name="process_order", op="function") as span:
    span.set_attribute("order_id", "123")
    span.set_attribute("customer_id", "456")
    # ... do work

# Using decorator
@syntra.trace(op="db.query")
def get_user(user_id: str):
    return db.get(user_id)

@syntra.trace(name="process_payment", op="payment")
async def process_payment(amount: float):
    await payment_gateway.charge(amount)
```

### Span Attributes

```python
with syntra.start_span(name="http.request") as span:
    span.set_attribute("http.method", "POST")
    span.set_attribute("http.url", "/api/users")
    span.set_attributes({
        "http.status_code": 200,
        "http.response_size": 1234,
    })
    span.add_event("request_received")
```

## Breadcrumbs

```python
from syntra.types import BreadcrumbType, BreadcrumbLevel

# Add navigation breadcrumb
syntra.add_breadcrumb(
    type=BreadcrumbType.NAVIGATION,
    category="router",
    message="Navigating to /dashboard",
)

# Add HTTP breadcrumb
syntra.add_breadcrumb(
    type=BreadcrumbType.HTTP,
    category="http",
    message="POST /api/users",
    data={"status_code": 201, "duration_ms": 150},
    level=BreadcrumbLevel.INFO,
)
```

## Framework Integrations

### FastAPI

```python
from fastapi import FastAPI
from syntra.frameworks.fastapi import SyntraMiddleware

app = FastAPI()

# Add middleware for automatic request tracing
app.add_middleware(SyntraMiddleware)

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

### Django

```python
# settings.py
MIDDLEWARE = [
    'syntra.frameworks.django.SyntraMiddleware',
    # ... other middleware
]
```

### Flask

```python
from flask import Flask
from syntra.frameworks.flask import init_app

app = Flask(__name__)
init_app(app)

@app.route("/")
def hello():
    return "Hello World"
```

## Context Management

```python
# Set user context
syntra.set_user({
    "id": "user-123",
    "email": "user@example.com",
    "username": "johndoe",
})

# Set tags
syntra.set_tag("environment", "production")
syntra.set_tag("version", "1.0.0")

# Set extra context
syntra.set_extra("order_details", {"items": 3, "total": 99.99})
```

## Scoped Context

```python
from syntra import with_scope

def process_order(order_id: str):
    def handler(scope):
        scope.set_tag("order_id", order_id)
        scope.set_extra("processing_time", time.time())

        # This error will include the scoped context
        try:
            do_processing()
        except Exception as e:
            syntra.capture_exception(e)

    with_scope(handler)
```

## Logging Integration

```python
import logging
from syntra.integrations.logging import SyntraLoggingHandler

# Add Syntra handler to your logger
logger = logging.getLogger()
logger.addHandler(SyntraLoggingHandler())

# Logs will be captured as breadcrumbs and errors
logger.error("Something went wrong", exc_info=True)
```

## Flushing and Cleanup

```python
import asyncio

# Flush pending data before shutdown
await syntra.flush()

# Close the SDK
await syntra.close()
```

## DSN Format

```
syn://<public_key>@<host>/<project_id>
```

Example: `syn://pk_abc123@syntra.io/proj_xyz`

## Requirements

- Python 3.9+
- httpx

## License

MIT

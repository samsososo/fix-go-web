#!/usr/bin/env python3
"""Incrementally synchronize managed Facebook Page posts into SQLite.

This tool intentionally uses only Python's standard library. Authentication is
performed with a long-lived user access token from a local .env file. Page
access tokens are discovered through /me/accounts and are never persisted.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import os
import random
import sqlite3
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


GRAPH_API_VERSION = "v21.0"
GRAPH_API_ROOT = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
POST_FIELDS = ",".join(
    (
        "id",
        "message",
        "created_time",
        "permalink_url",
        "full_picture",
        "shares",
        "reactions.summary(true)",
        "comments.summary(true)",
    )
)
RETRYABLE_GRAPH_CODES = frozenset({4, 17, 32, 613, 80001})
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = Path(__file__).resolve().with_name(".env")
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "facebook-page-posts.sqlite3"
DEFAULT_CSV_PATH = PROJECT_ROOT / "data" / "facebook-page-posts.csv"


class ConfigurationError(ValueError):
    """Raised when local configuration is missing or invalid."""


class GraphAPIError(RuntimeError):
    """A normalized Meta Graph API or transport error."""

    def __init__(
        self,
        message: str,
        *,
        http_status: int | None = None,
        graph_code: int | None = None,
        graph_subcode: int | None = None,
        transient: bool = False,
        retry_after: float | None = None,
        usage_backoff_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.graph_code = graph_code
        self.graph_subcode = graph_subcode
        self.transient = transient
        self.retry_after = retry_after
        self.usage_backoff_seconds = usage_backoff_seconds


class PaginationLoopError(RuntimeError):
    """Raised when Graph API returns the same paging URL twice."""


@dataclass(frozen=True)
class Config:
    page_ids: tuple[str, ...]
    user_access_token: str
    database_path: Path
    timeout_seconds: float
    max_attempts: int
    base_backoff_seconds: float
    max_backoff_seconds: float


@dataclass(frozen=True)
class PageAccess:
    page_id: str
    page_name: str
    access_token: str


@dataclass(frozen=True)
class UsageHeaders:
    app_usage: Any | None
    business_usage: Any | None
    max_percentage: float | None
    estimated_recovery_seconds: float | None


@dataclass(frozen=True)
class PageSyncResult:
    page_id: str
    page_name: str
    fetched_posts: int
    stored_posts: int
    previous_checkpoint: str | None
    new_checkpoint: str | None


STANDARD_LOG_RECORD_FIELDS = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()
)


class JsonLogFormatter(logging.Formatter):
    """Emit one JSON object per log record."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "event": getattr(record, "event", "log"),
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in STANDARD_LOG_RECORD_FIELDS and key != "event":
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str) -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())
    logger = logging.getLogger("facebook_page_sync")
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(level.upper())
    logger.propagate = False
    return logger


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    message: str,
    **fields: Any,
) -> None:
    logger.log(level, message, extra={"event": event, **fields})


def parse_dotenv(path: Path) -> dict[str, str]:
    """Parse the small KEY=VALUE subset needed by this standalone tool."""

    if not path.exists():
        raise ConfigurationError(
            f"Environment file not found: {path}. Copy .env.example to .env."
        )

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            raise ConfigurationError(
                f"Invalid .env entry on line {line_number}: expected KEY=VALUE."
            )
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            raise ConfigurationError(
                f"Invalid .env entry on line {line_number}: empty key."
            )
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def unique_page_ids(raw: str) -> tuple[str, ...]:
    values: list[str] = []
    seen: set[str] = set()
    for candidate in raw.replace("\n", ",").split(","):
        page_id = candidate.strip()
        if not page_id:
            continue
        if not page_id.isdigit():
            raise ConfigurationError(
                f"Invalid Facebook Page ID {page_id!r}; Page IDs must be numeric."
            )
        if page_id not in seen:
            seen.add(page_id)
            values.append(page_id)
    if not values:
        raise ConfigurationError("FACEBOOK_PAGE_IDS must contain at least one Page ID.")
    return tuple(values)


def resolve_env_path(raw: str | None, env_file: Path, fallback: Path) -> Path:
    if not raw:
        return fallback
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = env_file.parent / candidate
    return candidate.resolve()


def load_config(args: argparse.Namespace) -> Config:
    env_file = Path(args.env_file).expanduser().resolve()
    file_values = parse_dotenv(env_file)
    values = {**file_values, **os.environ}

    page_ids = unique_page_ids(values.get("FACEBOOK_PAGE_IDS", ""))
    token = values.get("FACEBOOK_USER_ACCESS_TOKEN", "").strip()
    if not token or token.lower().startswith("replace"):
        raise ConfigurationError(
            "FACEBOOK_USER_ACCESS_TOKEN must be a long-lived user access token."
        )

    configured_db = args.database or values.get("FACEBOOK_SQLITE_PATH")
    database_path = (
        Path(args.database).expanduser().resolve()
        if args.database
        else resolve_env_path(configured_db, env_file, DEFAULT_DB_PATH)
    )

    if args.max_attempts < 1:
        raise ConfigurationError("--max-attempts must be at least 1.")
    numeric_values = (
        args.timeout,
        args.base_backoff,
        args.max_backoff,
    )
    if not all(math.isfinite(value) for value in numeric_values):
        raise ConfigurationError("Timeout and backoff values must be finite.")
    if args.timeout <= 0:
        raise ConfigurationError("--timeout must be greater than 0.")
    if args.base_backoff <= 0 or args.max_backoff <= 0:
        raise ConfigurationError("Backoff values must be positive.")
    if args.base_backoff > args.max_backoff:
        raise ConfigurationError("--base-backoff cannot exceed --max-backoff.")

    return Config(
        page_ids=page_ids,
        user_access_token=token,
        database_path=database_path,
        timeout_seconds=args.timeout,
        max_attempts=args.max_attempts,
        base_backoff_seconds=args.base_backoff,
        max_backoff_seconds=args.max_backoff,
    )


def _header_value(headers: Mapping[str, Any], name: str) -> str | None:
    expected = name.lower()
    for key, value in headers.items():
        if str(key).lower() == expected:
            return str(value)
    return None


def _parse_json_header(headers: Mapping[str, Any], name: str) -> Any | None:
    raw = _header_value(headers, name)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None


def _usage_percentages(value: Any) -> Iterable[float]:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            if key in {"call_count", "total_cputime", "total_time"} and isinstance(
                nested, (int, float)
            ) and not isinstance(nested, bool):
                yield float(nested)
            else:
                yield from _usage_percentages(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _usage_percentages(nested)


def _estimated_recovery_seconds(value: Any) -> Iterable[float]:
    """Yield Meta business-usage recovery estimates converted from minutes."""

    if isinstance(value, Mapping):
        for key, nested in value.items():
            if (
                key == "estimated_time_to_regain_access"
                and isinstance(nested, (int, float))
                and not isinstance(nested, bool)
            ):
                yield max(0.0, float(nested) * 60.0)
            else:
                yield from _estimated_recovery_seconds(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _estimated_recovery_seconds(nested)


def parse_usage_headers(headers: Mapping[str, Any]) -> UsageHeaders:
    app_usage = _parse_json_header(headers, "X-App-Usage")
    business_usage = _parse_json_header(headers, "X-Business-Use-Case-Usage")
    percentages = [
        *_usage_percentages(app_usage),
        *_usage_percentages(business_usage),
    ]
    recovery_estimates = [*_estimated_recovery_seconds(business_usage)]
    return UsageHeaders(
        app_usage=app_usage,
        business_usage=business_usage,
        max_percentage=max(percentages) if percentages else None,
        estimated_recovery_seconds=(
            max(recovery_estimates) if recovery_estimates else None
        ),
    )


def parse_retry_after(headers: Mapping[str, Any]) -> float | None:
    value = _header_value(headers, "Retry-After")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None


def safe_url(url: str) -> str:
    """Remove query parameters because paging.next may contain access tokens."""

    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def decode_json_object(body: bytes) -> dict[str, Any]:
    try:
        decoded = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GraphAPIError("Graph API returned invalid JSON.") from error
    if not isinstance(decoded, dict):
        raise GraphAPIError("Graph API returned a non-object JSON response.")
    return decoded


def graph_error_from_payload(
    payload: Mapping[str, Any],
    *,
    http_status: int | None,
    headers: Mapping[str, Any],
) -> GraphAPIError:
    error_payload = payload.get("error")
    error = error_payload if isinstance(error_payload, Mapping) else {}
    graph_code = error.get("code")
    graph_subcode = error.get("error_subcode")
    usage = parse_usage_headers(headers)
    return GraphAPIError(
        str(error.get("message") or f"Graph API HTTP {http_status or 'error'}"),
        http_status=http_status,
        graph_code=int(graph_code) if isinstance(graph_code, (int, float)) else None,
        graph_subcode=(
            int(graph_subcode) if isinstance(graph_subcode, (int, float)) else None
        ),
        transient=bool(error.get("is_transient")),
        retry_after=parse_retry_after(headers),
        usage_backoff_seconds=usage.estimated_recovery_seconds,
    )


def is_retryable(error: GraphAPIError) -> bool:
    return (
        error.transient
        or error.graph_code in RETRYABLE_GRAPH_CODES
        or error.http_status == 429
        or (error.http_status is not None and 500 <= error.http_status <= 599)
    )


class GraphApiClient:
    def __init__(
        self,
        config: Config,
        logger: logging.Logger,
        *,
        sleep: Callable[[float], None] = time.sleep,
        random_uniform: Callable[[float, float], float] = random.uniform,
        open_url: Callable[..., Any] = urlopen,
    ) -> None:
        self.config = config
        self.logger = logger
        self.sleep = sleep
        self.random_uniform = random_uniform
        self.open_url = open_url

    @staticmethod
    def url(path: str, params: Mapping[str, Any] | None = None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        url = f"{GRAPH_API_ROOT}{normalized_path}"
        if params:
            query = urlencode(
                {key: value for key, value in params.items() if value is not None}
            )
            return f"{url}?{query}"
        return url

    def _log_usage(self, headers: Mapping[str, Any], request_url: str) -> None:
        usage = parse_usage_headers(headers)
        if usage.app_usage is None and usage.business_usage is None:
            return
        level = (
            logging.WARNING
            if usage.max_percentage is not None and usage.max_percentage >= 80
            else logging.DEBUG
        )
        log_event(
            self.logger,
            level,
            "graph_usage",
            "Parsed Meta Graph API usage headers.",
            endpoint=safe_url(request_url),
            max_usage_percentage=usage.max_percentage,
            estimated_recovery_seconds=usage.estimated_recovery_seconds,
            app_usage=usage.app_usage,
            business_usage=usage.business_usage,
        )

    def get_json(self, request_url: str, access_token: str) -> dict[str, Any]:
        last_error: GraphAPIError | None = None
        for attempt in range(1, self.config.max_attempts + 1):
            request = Request(
                request_url,
                method="GET",
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                    "User-Agent": "Hotfix24FacebookPageSync/1.0",
                },
            )
            response_headers: Mapping[str, Any] = {}
            try:
                with self.open_url(
                    request, timeout=self.config.timeout_seconds
                ) as response:
                    response_headers = response.headers
                    self._log_usage(response_headers, request_url)
                    payload = decode_json_object(response.read())
                    status = getattr(response, "status", 200)
                    if status >= 400 or "error" in payload:
                        raise graph_error_from_payload(
                            payload,
                            http_status=status,
                            headers=response_headers,
                        )
                    return payload
            except HTTPError as error:
                response_headers = error.headers or {}
                self._log_usage(response_headers, request_url)
                body = error.read()
                try:
                    payload = decode_json_object(body)
                except GraphAPIError:
                    payload = {}
                last_error = graph_error_from_payload(
                    payload,
                    http_status=error.code,
                    headers=response_headers,
                )
            except GraphAPIError as error:
                last_error = error
            except (URLError, TimeoutError, OSError) as error:
                last_error = GraphAPIError(
                    f"Graph API transport error: {type(error).__name__}",
                    transient=True,
                )

            assert last_error is not None
            if not is_retryable(last_error) or attempt >= self.config.max_attempts:
                raise last_error

            backoff_cap = min(
                self.config.max_backoff_seconds,
                self.config.base_backoff_seconds * (2 ** (attempt - 1)),
            )
            delay = self.random_uniform(0.0, backoff_cap)
            if last_error.retry_after is not None:
                delay = max(delay, last_error.retry_after)
            if last_error.usage_backoff_seconds is not None:
                delay = max(
                    delay,
                    min(
                        self.config.max_backoff_seconds,
                        last_error.usage_backoff_seconds,
                    ),
                )
            log_event(
                self.logger,
                logging.WARNING,
                "graph_request_retry",
                "Retrying a transient Meta Graph API request.",
                endpoint=safe_url(request_url),
                attempt=attempt,
                next_attempt=attempt + 1,
                delay_seconds=round(delay, 3),
                http_status=last_error.http_status,
                graph_code=last_error.graph_code,
                graph_subcode=last_error.graph_subcode,
            )
            self.sleep(delay)

        raise last_error or GraphAPIError("Graph API request failed.")


def sanitize_paging_url(value: str) -> str:
    """Validate a Graph paging URL and remove any token from its query."""

    parts = urlsplit(value)
    if parts.scheme != "https" or parts.netloc != "graph.facebook.com":
        raise GraphAPIError("Graph API returned an untrusted paging.next URL.")
    filtered_query = urlencode(
        [
            (key, item)
            for key, item in parse_qsl(parts.query, keep_blank_values=True)
            if key.lower() != "access_token"
        ],
        doseq=True,
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, filtered_query, ""))


def next_page_url(payload: Mapping[str, Any]) -> str | None:
    paging = payload.get("paging")
    if not isinstance(paging, Mapping):
        return None
    value = paging.get("next")
    return sanitize_paging_url(value) if isinstance(value, str) and value else None


def fetch_managed_pages(
    client: GraphApiClient, user_access_token: str
) -> dict[str, PageAccess]:
    request_url: str | None = client.url(
        "/me/accounts",
        {"fields": "id,name,access_token,tasks", "limit": 100},
    )
    seen_urls: set[str] = set()
    pages: dict[str, PageAccess] = {}

    while request_url:
        if request_url in seen_urls:
            raise PaginationLoopError(
                "Repeated paging.next while reading /me/accounts."
            )
        seen_urls.add(request_url)
        payload = client.get_json(request_url, user_access_token)
        rows = payload.get("data", [])
        if not isinstance(rows, list):
            raise GraphAPIError("Graph API /me/accounts returned invalid data.")
        for row in rows:
            if not isinstance(row, Mapping):
                continue
            page_id = row.get("id")
            page_token = row.get("access_token")
            if not isinstance(page_id, str) or not isinstance(page_token, str):
                continue
            page_name = row.get("name")
            pages[page_id] = PageAccess(
                page_id=page_id,
                page_name=page_name if isinstance(page_name, str) else page_id,
                access_token=page_token,
            )
        request_url = next_page_url(payload)
    return pages


def parse_graph_datetime(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ValueError(f"Invalid Graph API created_time: {value!r}") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def summary_count(value: Any) -> int | None:
    if not isinstance(value, Mapping):
        return None
    summary = value.get("summary")
    if not isinstance(summary, Mapping):
        return None
    total = summary.get("total_count")
    return (
        int(total)
        if isinstance(total, (int, float)) and not isinstance(total, bool)
        else None
    )


def shares_count(value: Any) -> int | None:
    if not isinstance(value, Mapping):
        return None
    count = value.get("count")
    return (
        int(count)
        if isinstance(count, (int, float)) and not isinstance(count, bool)
        else None
    )


class SQLiteStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute("PRAGMA busy_timeout=30000")
        self._initialize()

    def _initialize(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS posts (
                post_id TEXT PRIMARY KEY,
                page_id TEXT NOT NULL,
                page_name TEXT NOT NULL,
                message TEXT,
                created_time TEXT NOT NULL,
                permalink_url TEXT,
                full_picture TEXT,
                shares_count INTEGER,
                reactions_count INTEGER,
                comments_count INTEGER,
                synced_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS posts_page_created_idx
                ON posts(page_id, created_time DESC);

            CREATE TABLE IF NOT EXISTS page_sync_state (
                page_id TEXT PRIMARY KEY,
                last_created_time TEXT,
                last_successful_sync_at TEXT NOT NULL
            );

            PRAGMA user_version=1;
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def get_checkpoint(self, page_id: str) -> str | None:
        row = self.connection.execute(
            "SELECT last_created_time FROM page_sync_state WHERE page_id = ?",
            (page_id,),
        ).fetchone()
        if row is None:
            return None
        value = row["last_created_time"]
        return value if isinstance(value, str) and value else None

    def upsert_post(
        self,
        page: PageAccess,
        post: Mapping[str, Any],
        synced_at: str,
    ) -> bool:
        post_id = post.get("id")
        created_time = post.get("created_time")
        if not isinstance(post_id, str) or not post_id:
            raise ValueError("Facebook post is missing id.")
        if not isinstance(created_time, str) or not created_time:
            raise ValueError(f"Facebook post {post_id} is missing created_time.")
        parse_graph_datetime(created_time)
        is_new = (
            self.connection.execute(
                "SELECT 1 FROM posts WHERE post_id = ?",
                (post_id,),
            ).fetchone()
            is None
        )

        def optional_string(key: str) -> str | None:
            value = post.get(key)
            return value if isinstance(value, str) else None

        self.connection.execute(
            """
            INSERT INTO posts (
                post_id, page_id, page_name, message, created_time,
                permalink_url, full_picture, shares_count, reactions_count,
                comments_count, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(post_id) DO UPDATE SET
                page_id = excluded.page_id,
                page_name = excluded.page_name,
                message = excluded.message,
                created_time = excluded.created_time,
                permalink_url = excluded.permalink_url,
                full_picture = excluded.full_picture,
                shares_count = excluded.shares_count,
                reactions_count = excluded.reactions_count,
                comments_count = excluded.comments_count,
                synced_at = excluded.synced_at
            """,
            (
                post_id,
                page.page_id,
                page.page_name,
                optional_string("message"),
                created_time,
                optional_string("permalink_url"),
                optional_string("full_picture"),
                shares_count(post.get("shares")),
                summary_count(post.get("reactions")),
                summary_count(post.get("comments")),
                synced_at,
            ),
        )
        return is_new

    def save_checkpoint(
        self,
        page_id: str,
        last_created_time: str | None,
        synced_at: str,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO page_sync_state (
                page_id, last_created_time, last_successful_sync_at
            ) VALUES (?, ?, ?)
            ON CONFLICT(page_id) DO UPDATE SET
                last_created_time = excluded.last_created_time,
                last_successful_sync_at = excluded.last_successful_sync_at
            """,
            (page_id, last_created_time, synced_at),
        )


def sync_page(
    client: GraphApiClient,
    store: SQLiteStore,
    page: PageAccess,
    logger: logging.Logger,
) -> PageSyncResult:
    checkpoint = store.get_checkpoint(page.page_id)
    checkpoint_dt = parse_graph_datetime(checkpoint) if checkpoint else None
    params: dict[str, Any] = {"fields": POST_FIELDS, "limit": 100}
    if checkpoint_dt:
        # Graph's `since` boundary can be inclusive or exclusive depending on
        # the edge. A one-second overlap plus primary-key upsert avoids missing
        # a different post created in the exact checkpoint second.
        params["since"] = max(0, int(checkpoint_dt.timestamp()) - 1)

    request_url: str | None = client.url(f"/{page.page_id}/posts", params)
    seen_urls: set[str] = set()
    fetched_posts = 0
    stored_posts = 0
    newest_checkpoint = checkpoint
    newest_dt = checkpoint_dt
    synced_at = datetime.now(timezone.utc).isoformat()

    with store.connection:
        while request_url:
            if request_url in seen_urls:
                raise PaginationLoopError(
                    f"Repeated paging.next while reading Page {page.page_id}."
                )
            seen_urls.add(request_url)
            payload = client.get_json(request_url, page.access_token)
            rows = payload.get("data", [])
            if not isinstance(rows, list):
                raise GraphAPIError(
                    f"Graph API returned invalid posts data for Page {page.page_id}."
                )
            for post in rows:
                if not isinstance(post, Mapping):
                    raise ValueError(
                        f"Graph API returned a non-object post for Page {page.page_id}."
                    )
                fetched_posts += 1
                created_time = post.get("created_time")
                if not isinstance(created_time, str):
                    raise ValueError("Facebook post is missing created_time.")
                created_dt = parse_graph_datetime(created_time)
                if checkpoint_dt is not None and created_dt < checkpoint_dt:
                    continue
                if store.upsert_post(page, post, synced_at):
                    stored_posts += 1
                if newest_dt is None or created_dt > newest_dt:
                    newest_dt = created_dt
                    newest_checkpoint = created_time
            request_url = next_page_url(payload)

        store.save_checkpoint(page.page_id, newest_checkpoint, synced_at)

    log_event(
        logger,
        logging.INFO,
        "page_sync_complete",
        "Completed Facebook Page post synchronization.",
        page_id=page.page_id,
        page_name=page.page_name,
        fetched_posts=fetched_posts,
        stored_posts=stored_posts,
        previous_checkpoint=checkpoint,
        new_checkpoint=newest_checkpoint,
    )
    return PageSyncResult(
        page_id=page.page_id,
        page_name=page.page_name,
        fetched_posts=fetched_posts,
        stored_posts=stored_posts,
        previous_checkpoint=checkpoint,
        new_checkpoint=newest_checkpoint,
    )


def sync_requested_pages(
    page_ids: Sequence[str],
    managed_pages: Mapping[str, PageAccess],
    client: GraphApiClient,
    store: SQLiteStore,
    logger: logging.Logger,
) -> tuple[list[PageSyncResult], list[str]]:
    results: list[PageSyncResult] = []
    failures: list[str] = []
    for page_id in page_ids:
        page = managed_pages.get(page_id)
        if page is None:
            failures.append(page_id)
            log_event(
                logger,
                logging.ERROR,
                "page_access_missing",
                "Requested Page was not returned by /me/accounts.",
                page_id=page_id,
            )
            continue
        try:
            results.append(sync_page(client, store, page, logger))
        except Exception as error:  # Per-page isolation is intentional.
            failures.append(page_id)
            fields: dict[str, Any] = {
                "page_id": page_id,
                "page_name": page.page_name,
                "error_type": type(error).__name__,
            }
            if isinstance(error, GraphAPIError):
                fields.update(
                    {
                        "http_status": error.http_status,
                        "graph_code": error.graph_code,
                        "graph_subcode": error.graph_subcode,
                    }
                )
            log_event(
                logger,
                logging.ERROR,
                "page_sync_failed",
                "Facebook Page synchronization failed; continuing with other Pages.",
                **fields,
            )
    return results, failures


CSV_FIELDS = (
    "post_id",
    "page_id",
    "page_name",
    "message",
    "created_time",
    "permalink_url",
    "full_picture",
    "shares_count",
    "reactions_count",
    "comments_count",
    "synced_at",
)


def csv_safe(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def ensure_safe_csv_output(database_path: Path, output_path: Path) -> None:
    database_path = database_path.expanduser().resolve()
    protected_paths = {
        database_path,
        Path(f"{database_path}-wal"),
        Path(f"{database_path}-shm"),
        Path(f"{database_path}-journal"),
    }
    if output_path.expanduser().resolve() in protected_paths:
        raise ConfigurationError(
            "CSV output path cannot overwrite the SQLite database or one of "
            "its companion files."
        )


def export_csv(store: SQLiteStore, output_path: Path) -> int:
    ensure_safe_csv_output(store.path, output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = store.connection.execute(
        f"SELECT {', '.join(CSV_FIELDS)} FROM posts "
        "ORDER BY page_id, created_time DESC"
    )
    count = 0
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8-sig",
            newline="",
            dir=output_path.parent,
            prefix=f".{output_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
            writer.writeheader()
            for row in rows:
                writer.writerow({key: csv_safe(row[key]) for key in CSV_FIELDS})
                count += 1
        os.replace(temporary_name, output_path)
    finally:
        if temporary_name and Path(temporary_name).exists():
            Path(temporary_name).unlink()
    return count


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Incrementally sync managed Facebook Page posts into SQLite."
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Path to .env (default: tools/facebook_page_sync/.env).",
    )
    parser.add_argument(
        "--database",
        help="SQLite path; overrides FACEBOOK_SQLITE_PATH.",
    )
    parser.add_argument(
        "--export-csv",
        nargs="?",
        const=str(DEFAULT_CSV_PATH),
        metavar="PATH",
        help="Export all stored posts to CSV, optionally to PATH.",
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--max-attempts", type=int, default=6)
    parser.add_argument("--base-backoff", type=float, default=1.0)
    parser.add_argument("--max-backoff", type=float, default=60.0)
    parser.add_argument(
        "--log-level",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        default="INFO",
    )
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    logger = configure_logging(args.log_level)
    try:
        config = load_config(args)
        csv_output_path = (
            Path(args.export_csv).expanduser().resolve()
            if args.export_csv
            else None
        )
        if csv_output_path is not None:
            ensure_safe_csv_output(config.database_path, csv_output_path)
    except ConfigurationError as error:
        log_event(
            logger,
            logging.ERROR,
            "configuration_error",
            str(error),
        )
        return 2

    store: SQLiteStore | None = None
    try:
        client = GraphApiClient(config, logger)
        store = SQLiteStore(config.database_path)
        log_event(
            logger,
            logging.INFO,
            "sync_started",
            "Starting Facebook Page post synchronization.",
            graph_api_version=GRAPH_API_VERSION,
            requested_page_count=len(config.page_ids),
            database_path=str(config.database_path),
        )
        managed_pages = fetch_managed_pages(client, config.user_access_token)
        results, failures = sync_requested_pages(
            config.page_ids,
            managed_pages,
            client,
            store,
            logger,
        )

        csv_export_failed = False
        if csv_output_path is not None:
            try:
                exported_rows = export_csv(store, csv_output_path)
                log_event(
                    logger,
                    logging.INFO,
                    "csv_export_complete",
                    "Exported synchronized Facebook Page posts to CSV.",
                    output_path=str(csv_output_path),
                    exported_rows=exported_rows,
                )
            except Exception as error:
                csv_export_failed = True
                log_event(
                    logger,
                    logging.ERROR,
                    "csv_export_failed",
                    "Unable to export synchronized Facebook Page posts to CSV.",
                    output_path=str(csv_output_path),
                    error_type=type(error).__name__,
                    error_message=str(error),
                )

        log_event(
            logger,
            (
                logging.INFO
                if not failures and not csv_export_failed
                else logging.WARNING
            ),
            "sync_finished",
            "Finished Facebook Page post synchronization.",
            successful_pages=len(results),
            failed_pages=len(failures),
            failed_page_ids=failures,
            csv_export_failed=csv_export_failed,
            stored_posts=sum(item.stored_posts for item in results),
        )
        return 1 if failures or csv_export_failed else 0
    except Exception as error:
        fields: dict[str, Any] = {"error_type": type(error).__name__}
        if isinstance(error, GraphAPIError):
            fields.update(
                {
                    "http_status": error.http_status,
                    "graph_code": error.graph_code,
                    "graph_subcode": error.graph_subcode,
                }
            )
        log_event(
            logger,
            logging.ERROR,
            "sync_fatal_error",
            "Facebook Page synchronization terminated with a fatal error.",
            **fields,
        )
        return 1
    finally:
        if store is not None:
            store.close()


if __name__ == "__main__":
    raise SystemExit(run())

from __future__ import annotations

import contextlib
import csv
import json
import io
import logging
import sqlite3
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest import mock
from urllib.error import HTTPError


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_ROOT))

import sync  # noqa: E402


def api_url(
    path: str,
    params: dict[str, Any] | None = None,
    graph_api_version: str = sync.DEFAULT_GRAPH_API_VERSION,
) -> str:
    return sync.build_graph_api_url(graph_api_version, path, params)


def write_secure_env(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o600)


class FakeClient:
    def __init__(
        self,
        responses: dict[str, dict[str, Any] | Exception],
        *,
        graph_api_version: str = sync.DEFAULT_GRAPH_API_VERSION,
    ) -> None:
        self.responses = responses
        self.graph_api_version = graph_api_version
        self.calls: list[tuple[str, str]] = []

    def url(self, path: str, params: dict[str, Any] | None = None) -> str:
        return api_url(path, params, self.graph_api_version)

    def get_json(self, url: str, token: str) -> dict[str, Any]:
        self.calls.append((url, token))
        response = self.responses[url]
        if isinstance(response, Exception):
            raise response
        return response


def quiet_logger() -> logging.Logger:
    logger = logging.getLogger(f"facebook_page_sync_test_{id(object())}")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    logger.propagate = False
    return logger


class StructuredLoggingTests(unittest.TestCase):
    def test_formatter_omits_raw_page_name(self) -> None:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(sync.JsonLogFormatter())
        logger = logging.getLogger(f"facebook_page_sync_log_test_{id(object())}")
        logger.handlers.clear()
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False

        sync.log_event(
            logger,
            logging.INFO,
            "page_sync_complete",
            "Completed Facebook Page post synchronization.",
            page_id="123",
            page_name="Sensitive Page Display Name",
        )

        payload = json.loads(stream.getvalue())
        self.assertEqual(payload["page_id"], "123")
        self.assertNotIn("page_name", payload)
        self.assertNotIn("Sensitive Page Display Name", stream.getvalue())


class UsageHeaderTests(unittest.TestCase):
    def test_parses_app_and_business_usage_case_insensitively(self) -> None:
        headers = {
            "x-app-usage": json.dumps(
                {"call_count": 81, "total_cputime": 12, "total_time": 20}
            ),
            "X-Business-Use-Case-Usage": json.dumps(
                {
                    "123": [
                        {
                            "type": "pages",
                            "call_count": 35,
                            "estimated_time_to_regain_access": 7,
                        }
                    ]
                }
            ),
        }

        usage = sync.parse_usage_headers(headers)

        self.assertEqual(usage.app_usage["call_count"], 81)
        self.assertEqual(usage.business_usage["123"][0]["type"], "pages")
        self.assertEqual(usage.max_percentage, 81)
        self.assertEqual(usage.estimated_recovery_seconds, 420)


class ManagedPageTests(unittest.TestCase):
    def test_me_accounts_follows_paging_next(self) -> None:
        first = api_url(
            "/me/accounts", {"fields": "id,name,access_token,tasks", "limit": 100}
        )
        second = "https://graph.facebook.com/v26.0/me/accounts?after=cursor"
        client = FakeClient(
            {
                first: {
                    "data": [{"id": "1", "name": "One", "access_token": "p1"}],
                    "paging": {"next": second},
                },
                second: {
                    "data": [{"id": "2", "name": "Two", "access_token": "p2"}]
                },
            }
        )

        pages = sync.fetch_managed_pages(client, "user-token")

        self.assertEqual(set(pages), {"1", "2"})
        self.assertEqual(
            [call[1] for call in client.calls],
            ["user-token", "user-token"],
        )

    def test_client_builds_all_new_urls_with_configured_version(self) -> None:
        config = sync.Config(
            page_ids=("1",),
            user_access_token="user-token",
            database_path=Path("unused.sqlite3"),
            timeout_seconds=1,
            max_attempts=1,
            base_backoff_seconds=1,
            max_backoff_seconds=1,
            graph_api_version="v25.0",
        )
        client = sync.GraphApiClient(config, quiet_logger())

        self.assertEqual(
            client.url("/me/accounts"),
            "https://graph.facebook.com/v25.0/me/accounts",
        )
        self.assertEqual(
            client.url("/123/posts", {"limit": 100}),
            "https://graph.facebook.com/v25.0/123/posts?limit=100",
        )


class SQLiteSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = sync.SQLiteStore(Path(self.temp_dir.name) / "posts.sqlite3")
        self.logger = quiet_logger()
        self.page = sync.PageAccess("123", "Test Page", "page-token")

    def tearDown(self) -> None:
        self.store.close()
        self.temp_dir.cleanup()

    def test_sqlite_database_is_owner_only(self) -> None:
        self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)

    def test_schema_migrates_run_id_checkpoint_column(self) -> None:
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        connection = sqlite3.connect(legacy_path)
        connection.execute(
            """
            CREATE TABLE page_sync_state (
                page_id TEXT PRIMARY KEY,
                last_created_time TEXT,
                last_successful_sync_at TEXT NOT NULL
            )
            """
        )
        connection.execute("PRAGMA user_version=1")
        connection.commit()
        connection.close()

        migrated = sync.SQLiteStore(legacy_path)
        try:
            columns = {
                row[1]
                for row in migrated.connection.execute(
                    "PRAGMA table_info(page_sync_state)"
                )
            }
            version = migrated.connection.execute("PRAGMA user_version").fetchone()[0]
        finally:
            migrated.close()

        self.assertIn("last_successful_run_id", columns)
        self.assertEqual(version, 2)
        self.assertEqual(legacy_path.stat().st_mode & 0o777, 0o600)

    def test_sync_is_paginated_and_incremental(self) -> None:
        first_url = api_url(
            "/123/posts", {"fields": sync.POST_FIELDS, "limit": 100}
        )
        second_url = "https://graph.facebook.com/v26.0/123/posts?after=cursor"
        first_client = FakeClient(
            {
                first_url: {
                    "data": [
                        {
                            "id": "123_2",
                            "message": "newer",
                            "created_time": "2026-08-15T10:00:00+0000",
                            "permalink_url": "https://facebook.example/123_2",
                            "shares": {"count": 2},
                            "reactions": {"summary": {"total_count": 5}},
                            "comments": {"summary": {"total_count": 3}},
                        }
                    ],
                    "paging": {"next": second_url},
                },
                second_url: {
                    "data": [
                        {
                            "id": "123_1",
                            "message": "older",
                            "created_time": "2026-08-14T10:00:00+0000",
                        }
                    ]
                },
            }
        )

        first_result = sync.sync_page(
            first_client,
            self.store,
            self.page,
            self.logger,
            run_id="run-first",
        )

        self.assertEqual(first_result.stored_posts, 2)
        self.assertEqual(
            self.store.get_checkpoint("123"), "2026-08-15T10:00:00+0000"
        )
        self.assertEqual(self.store.get_last_successful_run_id("123"), "run-first")
        stored = self.store.connection.execute(
            "SELECT COUNT(*) FROM posts"
        ).fetchone()[0]
        self.assertEqual(stored, 2)

        incremental_url = api_url(
            "/123/posts",
            {
                "fields": sync.POST_FIELDS,
                "limit": 100,
                "since": 1786787999,
            },
        )
        second_client = FakeClient(
            {
                incremental_url: {
                    "data": [
                        {
                            "id": "123_3",
                            "message": "latest",
                            "created_time": "2026-08-16T10:00:00+0000",
                        },
                        {
                            "id": "123_2",
                            "message": "newer but not newer than checkpoint",
                            "created_time": "2026-08-15T10:00:00+0000",
                        },
                    ]
                }
            }
        )

        second_result = sync.sync_page(
            second_client,
            self.store,
            self.page,
            self.logger,
            initial_lookback_days=14,
            run_id="run-second",
        )

        self.assertEqual(second_result.stored_posts, 1)
        self.assertEqual(
            self.store.get_checkpoint("123"), "2026-08-16T10:00:00+0000"
        )
        self.assertEqual(self.store.get_last_successful_run_id("123"), "run-second")
        stored = self.store.connection.execute(
            "SELECT COUNT(*) FROM posts"
        ).fetchone()[0]
        self.assertEqual(stored, 3)

    def test_initial_lookback_only_stores_posts_from_last_14_days(self) -> None:
        reference_time = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)
        lower_bound = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
        request_url = api_url(
            "/123/posts",
            {
                "fields": sync.POST_FIELDS,
                "limit": 100,
                "since": int(lower_bound.timestamp()) - 1,
            },
        )
        client = FakeClient(
            {
                request_url: {
                    "data": [
                        {
                            "id": "123_new",
                            "message": "inside window",
                            "created_time": "2026-08-10T12:00:00+0000",
                        },
                        {
                            "id": "123_boundary",
                            "message": "on boundary",
                            "created_time": "2026-08-01T12:00:00+0000",
                        },
                        {
                            "id": "123_old",
                            "message": "outside window",
                            "created_time": "2026-08-01T11:59:59+0000",
                        },
                    ]
                }
            }
        )

        result = sync.sync_page(
            client,
            self.store,
            self.page,
            self.logger,
            initial_lookback_days=14,
            now=reference_time,
        )

        self.assertEqual(result.fetched_posts, 3)
        self.assertEqual(result.stored_posts, 2)
        stored_ids = {
            row["post_id"]
            for row in self.store.connection.execute("SELECT post_id FROM posts")
        }
        self.assertEqual(stored_ids, {"123_new", "123_boundary"})
        self.assertEqual(
            self.store.get_checkpoint("123"),
            "2026-08-10T12:00:00+0000",
        )

    def test_two_pages_share_the_same_initial_lookback_cutoff(self) -> None:
        reference_time = datetime(
            2026,
            8,
            15,
            12,
            0,
            0,
            987654,
            tzinfo=timezone.utc,
        )
        lower_bound = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
        since = int(lower_bound.timestamp()) - 1
        first_page = sync.PageAccess("1", "First", "token-1")
        second_page = sync.PageAccess("2", "Second", "token-2")
        first_url = api_url(
            "/1/posts",
            {"fields": sync.POST_FIELDS, "limit": 100, "since": since},
        )
        second_url = api_url(
            "/2/posts",
            {"fields": sync.POST_FIELDS, "limit": 100, "since": since},
        )
        client = FakeClient(
            {
                first_url: {"data": []},
                second_url: {"data": []},
            }
        )

        results, failures = sync.sync_requested_pages(
            ["1", "2"],
            {"1": first_page, "2": second_page},
            client,
            self.store,
            self.logger,
            initial_lookback_days=14,
            now=reference_time,
        )

        self.assertEqual(failures, [])
        self.assertEqual([result.page_id for result in results], ["1", "2"])
        self.assertEqual(
            [url for url, _token in client.calls],
            [first_url, second_url],
        )

    def test_failed_page_rolls_back_and_other_page_continues(self) -> None:
        failing_page = sync.PageAccess("1", "Failing", "token-1")
        working_page = sync.PageAccess("2", "Working", "token-2")
        failing_url = api_url(
            "/1/posts", {"fields": sync.POST_FIELDS, "limit": 100}
        )
        failing_second_url = api_url(
            "/1/posts", {"fields": sync.POST_FIELDS, "limit": 100, "after": "p2"}
        )
        working_url = api_url(
            "/2/posts", {"fields": sync.POST_FIELDS, "limit": 100}
        )
        client = FakeClient(
            {
                failing_url: {
                    "data": [
                        {
                            "id": "1_partial",
                            "message": "must roll back",
                            "created_time": "2026-08-15T09:00:00+0000",
                        }
                    ],
                    "paging": {"next": failing_second_url},
                },
                failing_second_url: sync.GraphAPIError("failed", graph_code=4),
                working_url: {
                    "data": [
                        {
                            "id": "2_1",
                            "message": "ok",
                            "created_time": "2026-08-15T10:00:00+0000",
                        }
                    ]
                },
            }
        )

        results, failures = sync.sync_requested_pages(
            ["1", "2"],
            {"1": failing_page, "2": working_page},
            client,
            self.store,
            self.logger,
            run_id="batch-safe-id",
        )

        self.assertEqual(failures, ["1"])
        self.assertEqual([result.page_id for result in results], ["2"])
        self.assertIsNone(self.store.get_checkpoint("1"))
        self.assertIsNone(self.store.get_last_successful_run_id("1"))
        self.assertEqual(
            self.store.get_checkpoint("2"),
            "2026-08-15T10:00:00+0000",
        )
        self.assertEqual(
            self.store.get_last_successful_run_id("2"),
            "batch-safe-id",
        )
        rows = self.store.connection.execute(
            "SELECT post_id FROM posts ORDER BY post_id"
        ).fetchall()
        self.assertEqual([row["post_id"] for row in rows], ["2_1"])

    def test_csv_export_prevents_formula_injection(self) -> None:
        with self.store.connection:
            self.store.upsert_post(
                self.page,
                {
                    "id": "123_1",
                    "message": " \t\r\n=SUM(1,1)",
                    "created_time": "2026-08-15T10:00:00+0000",
                },
                "2026-08-15T11:00:00+00:00",
            )
        output = Path(self.temp_dir.name) / "posts.csv"

        count = sync.export_csv(self.store, output)

        self.assertEqual(count, 1)
        with output.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(rows[0]["message"], "' \t\r\n=SUM(1,1)")

    def test_csv_safe_handles_whitespace_and_control_prefixes(self) -> None:
        dangerous = (
            "=SUM(1,1)",
            "  +cmd",
            "\t-formula",
            "\r\n@formula",
            "\x1f=hidden",
            "\x7f+hidden",
        )
        for value in dangerous:
            with self.subTest(value=repr(value)):
                self.assertEqual(sync.csv_safe(value), f"'{value}")
        self.assertEqual(sync.csv_safe(" ordinary text"), " ordinary text")

    def test_csv_export_cannot_overwrite_sqlite_files(self) -> None:
        protected_paths = (
            self.store.path,
            Path(f"{self.store.path}-wal"),
            Path(f"{self.store.path}-shm"),
            Path(f"{self.store.path}-journal"),
        )

        for output_path in protected_paths:
            with self.subTest(output_path=output_path):
                with self.assertRaises(sync.ConfigurationError):
                    sync.export_csv(self.store, output_path)

        self.store.connection.execute("SELECT COUNT(*) FROM posts").fetchone()


class RunConfigurationTests(unittest.TestCase):
    def test_python_version_and_umask_fail_closed(self) -> None:
        sync.ensure_supported_python((3, 11, 0))
        with self.assertRaises(sync.ConfigurationError):
            sync.ensure_supported_python((3, 10, 99))

        with (
            mock.patch.object(sync.sys, "version_info", (3, 10, 99)),
            mock.patch.object(sync.os, "umask") as umask,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            exit_code = sync.run([])

        self.assertEqual(exit_code, 2)
        umask.assert_called_once_with(0o077)

    def test_env_file_must_be_regular_owner_only_0600(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_path = root / ".env"
            write_secure_env(
                env_path,
                "FACEBOOK_PAGE_IDS=1\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n",
            )
            self.assertEqual(sync.parse_dotenv(env_path)["FACEBOOK_PAGE_IDS"], "1")

            env_path.chmod(0o640)
            with self.assertRaises(sync.ConfigurationError):
                sync.parse_dotenv(env_path)

            env_path.unlink()
            env_path.mkdir()
            with self.assertRaises(sync.ConfigurationError):
                sync.parse_dotenv(env_path)

            env_path.rmdir()
            target_path = root / "actual.env"
            write_secure_env(
                target_path,
                "FACEBOOK_PAGE_IDS=1\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n",
            )
            env_path.symlink_to(target_path)
            parser = sync.build_argument_parser()
            with (
                mock.patch.dict(sync.os.environ, {}, clear=True),
                self.assertRaises(sync.ConfigurationError),
            ):
                sync.load_config(
                    parser.parse_args(["--env-file", str(env_path)])
                )

    def test_run_id_validation(self) -> None:
        run_id = "123e4567-e89b-12d3-a456-426614174000"
        self.assertEqual(sync.normalize_run_id(run_id), run_id)
        self.assertIsNone(sync.normalize_run_id(None))
        for value in ("", " unsafe", "unsafe/value", "x" * 129):
            with self.subTest(value=value):
                with self.assertRaises(sync.ConfigurationError):
                    sync.normalize_run_id(value)

    def test_env_lookback_and_cli_override_are_validated(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            write_secure_env(
                env_path,
                "FACEBOOK_PAGE_IDS=1,2\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n"
                "FACEBOOK_INITIAL_LOOKBACK_DAYS=14\n",
            )
            parser = sync.build_argument_parser()

            with mock.patch.dict(sync.os.environ, {}, clear=True):
                env_config = sync.load_config(
                    parser.parse_args(["--env-file", str(env_path)])
                )
                cli_config = sync.load_config(
                    parser.parse_args(
                        [
                            "--env-file",
                            str(env_path),
                            "--initial-lookback-days",
                            "7",
                        ]
                    )
                )

            self.assertEqual(env_config.initial_lookback_days, 14)
            self.assertEqual(cli_config.initial_lookback_days, 7)

            write_secure_env(
                env_path,
                "FACEBOOK_PAGE_IDS=1,2\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n"
                "FACEBOOK_INITIAL_LOOKBACK_DAYS=0\n",
            )
            with mock.patch.dict(sync.os.environ, {}, clear=True):
                with self.assertRaises(sync.ConfigurationError):
                    sync.load_config(
                        parser.parse_args(["--env-file", str(env_path)])
                    )

    def test_graph_api_version_defaults_and_cli_overrides_env(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            write_secure_env(
                env_path,
                "FACEBOOK_PAGE_IDS=1\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n"
                "FACEBOOK_GRAPH_API_VERSION=v25.0\n",
            )
            parser = sync.build_argument_parser()

            with mock.patch.dict(sync.os.environ, {}, clear=True):
                env_config = sync.load_config(
                    parser.parse_args(["--env-file", str(env_path)])
                )
                cli_config = sync.load_config(
                    parser.parse_args(
                        [
                            "--env-file",
                            str(env_path),
                            "--graph-api-version",
                            "v24.0",
                            "--run-id",
                            "config-test-run",
                        ]
                    )
                )

            self.assertEqual(env_config.graph_api_version, "v25.0")
            self.assertEqual(cli_config.graph_api_version, "v24.0")
            self.assertEqual(cli_config.run_id, "config-test-run")

            write_secure_env(
                env_path,
                "FACEBOOK_PAGE_IDS=1\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n",
            )
            with mock.patch.dict(sync.os.environ, {}, clear=True):
                default_config = sync.load_config(
                    parser.parse_args(["--env-file", str(env_path)])
                )

            self.assertEqual(
                default_config.graph_api_version,
                sync.DEFAULT_GRAPH_API_VERSION,
            )

    def test_graph_api_version_rejects_invalid_values(self) -> None:
        for value in ("26.0", "v26", "v0.0", "v26.1", "v26.0?debug=true"):
            with self.subTest(value=value):
                with self.assertRaises(sync.ConfigurationError):
                    sync.normalize_graph_api_version(value)

    def test_csv_database_collision_exits_before_network_or_database_open(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database_path = root / "posts.sqlite3"
            env_path = root / ".env"
            write_secure_env(
                env_path,
                "FACEBOOK_PAGE_IDS=123\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n",
            )

            with contextlib.redirect_stdout(io.StringIO()):
                exit_code = sync.run(
                    [
                        "--env-file",
                        str(env_path),
                        "--database",
                        str(database_path),
                        "--export-csv",
                        str(database_path),
                    ]
                )

            self.assertEqual(exit_code, 2)
            self.assertFalse(database_path.exists())


class FakeHttpResponse:
    def __init__(
        self,
        payload: dict[str, Any],
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.payload = payload
        self.status = status
        self.headers = headers or {}

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self) -> "FakeHttpResponse":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None


class RetryTests(unittest.TestCase):
    def make_config(self) -> sync.Config:
        return sync.Config(
            page_ids=("1",),
            user_access_token="user-token",
            database_path=Path("unused.sqlite3"),
            timeout_seconds=1,
            max_attempts=3,
            base_backoff_seconds=1,
            max_backoff_seconds=10,
        )

    def test_retries_rate_limit_graph_error_with_full_jitter(self) -> None:
        calls = 0
        delays: list[float] = []

        def opener(request: Any, timeout: float) -> FakeHttpResponse:
            nonlocal calls
            calls += 1
            self.assertEqual(timeout, 1)
            self.assertEqual(request.get_header("Authorization"), "Bearer token")
            if calls == 1:
                body = io.BytesIO(
                    json.dumps(
                        {"error": {"message": "rate limited", "code": 613}}
                    ).encode("utf-8")
                )
                headers = {
                    "X-Business-Use-Case-Usage": json.dumps(
                        {
                            "123": [
                                {
                                    "type": "pages",
                                    "estimated_time_to_regain_access": 2,
                                }
                            ]
                        }
                    )
                }
                raise HTTPError(
                    request.full_url, 400, "Bad Request", headers, body
                )
            return FakeHttpResponse({"data": []})

        client = sync.GraphApiClient(
            self.make_config(),
            quiet_logger(),
            sleep=delays.append,
            random_uniform=lambda _low, high: high,
            open_url=opener,
        )

        result = client.get_json("https://graph.facebook.com/v26.0/test", "token")

        self.assertEqual(result, {"data": []})
        self.assertEqual(calls, 2)
        self.assertEqual(delays, [10])

    def test_retryable_codes_and_http_statuses(self) -> None:
        for code in (4, 17, 32, 613, 80001):
            with self.subTest(code=code):
                self.assertTrue(
                    sync.is_retryable(sync.GraphAPIError("x", graph_code=code))
                )
        self.assertTrue(sync.is_retryable(sync.GraphAPIError("x", http_status=429)))
        self.assertTrue(sync.is_retryable(sync.GraphAPIError("x", http_status=503)))
        self.assertFalse(sync.is_retryable(sync.GraphAPIError("x", graph_code=190)))

    def test_default_http_client_rejects_redirect_without_forwarding_token(self) -> None:
        requests: list[tuple[str, str | None]] = []

        class RedirectServerHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                requests.append((self.path, self.headers.get("Authorization")))
                if self.path == "/start":
                    self.send_response(302)
                    self.send_header("Location", "/sink")
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"data": []}')

            def log_message(self, _format: str, *_args: Any) -> None:
                return None

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectServerHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = sync.GraphApiClient(self.make_config(), quiet_logger())
            with self.assertRaises(sync.GraphAPIError) as raised:
                client.get_json(
                    f"http://127.0.0.1:{server.server_port}/start",
                    "private-bearer-token",
                )
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertEqual(raised.exception.http_status, 302)
        self.assertEqual(requests, [("/start", "Bearer private-bearer-token")])

    def test_paging_url_drops_access_token_and_rejects_other_hosts(self) -> None:
        value = sync.sanitize_paging_url(
            "https://graph.facebook.com/v26.0/1/posts?after=abc&access_token=secret",
            "v26.0",
        )
        self.assertEqual(
            value, "https://graph.facebook.com/v26.0/1/posts?after=abc"
        )
        with self.assertRaises(sync.GraphAPIError):
            sync.sanitize_paging_url("https://example.com/steal?after=abc")
        with self.assertRaises(sync.GraphAPIError):
            sync.sanitize_paging_url(
                "https://graph.facebook.com:444/v26.0/1/posts?after=abc"
            )
        with self.assertRaises(sync.GraphAPIError):
            sync.sanitize_paging_url(
                "https://graph.facebook.com/v25.0/1/posts?after=abc",
                "v26.0",
            )


if __name__ == "__main__":
    unittest.main()

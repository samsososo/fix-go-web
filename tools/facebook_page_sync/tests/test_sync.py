from __future__ import annotations

import contextlib
import json
import io
import logging
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from urllib.error import HTTPError


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_ROOT))

import sync  # noqa: E402


class FakeClient:
    def __init__(self, responses: dict[str, dict[str, Any] | Exception]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    @staticmethod
    def url(path: str, params: dict[str, Any] | None = None) -> str:
        return sync.GraphApiClient.url(path, params)

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
        first = sync.GraphApiClient.url(
            "/me/accounts", {"fields": "id,name,access_token,tasks", "limit": 100}
        )
        second = "https://graph.facebook.com/v21.0/me/accounts?after=cursor"
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


class SQLiteSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = sync.SQLiteStore(Path(self.temp_dir.name) / "posts.sqlite3")
        self.logger = quiet_logger()
        self.page = sync.PageAccess("123", "Test Page", "page-token")

    def tearDown(self) -> None:
        self.store.close()
        self.temp_dir.cleanup()

    def test_sync_is_paginated_and_incremental(self) -> None:
        first_url = sync.GraphApiClient.url(
            "/123/posts", {"fields": sync.POST_FIELDS, "limit": 100}
        )
        second_url = "https://graph.facebook.com/v21.0/123/posts?after=cursor"
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
            first_client, self.store, self.page, self.logger
        )

        self.assertEqual(first_result.stored_posts, 2)
        self.assertEqual(
            self.store.get_checkpoint("123"), "2026-08-15T10:00:00+0000"
        )
        stored = self.store.connection.execute(
            "SELECT COUNT(*) FROM posts"
        ).fetchone()[0]
        self.assertEqual(stored, 2)

        incremental_url = sync.GraphApiClient.url(
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
            second_client, self.store, self.page, self.logger
        )

        self.assertEqual(second_result.stored_posts, 1)
        self.assertEqual(
            self.store.get_checkpoint("123"), "2026-08-16T10:00:00+0000"
        )
        stored = self.store.connection.execute(
            "SELECT COUNT(*) FROM posts"
        ).fetchone()[0]
        self.assertEqual(stored, 3)

    def test_failed_page_rolls_back_and_other_page_continues(self) -> None:
        failing_page = sync.PageAccess("1", "Failing", "token-1")
        working_page = sync.PageAccess("2", "Working", "token-2")
        failing_url = sync.GraphApiClient.url(
            "/1/posts", {"fields": sync.POST_FIELDS, "limit": 100}
        )
        working_url = sync.GraphApiClient.url(
            "/2/posts", {"fields": sync.POST_FIELDS, "limit": 100}
        )
        client = FakeClient(
            {
                failing_url: sync.GraphAPIError("failed", graph_code=4),
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
        )

        self.assertEqual(failures, ["1"])
        self.assertEqual([result.page_id for result in results], ["2"])
        self.assertIsNone(self.store.get_checkpoint("1"))
        self.assertEqual(
            self.store.get_checkpoint("2"),
            "2026-08-15T10:00:00+0000",
        )
        row = self.store.connection.execute(
            "SELECT post_id FROM posts"
        ).fetchone()
        self.assertEqual(row["post_id"], "2_1")

    def test_csv_export_prevents_formula_injection(self) -> None:
        with self.store.connection:
            self.store.upsert_post(
                self.page,
                {
                    "id": "123_1",
                    "message": "=SUM(1,1)",
                    "created_time": "2026-08-15T10:00:00+0000",
                },
                "2026-08-15T11:00:00+00:00",
            )
        output = Path(self.temp_dir.name) / "posts.csv"

        count = sync.export_csv(self.store, output)

        self.assertEqual(count, 1)
        content = output.read_text(encoding="utf-8-sig")
        self.assertIn("'=SUM(1,1)", content)

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
    def test_csv_database_collision_exits_before_network_or_database_open(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database_path = root / "posts.sqlite3"
            env_path = root / ".env"
            env_path.write_text(
                "FACEBOOK_PAGE_IDS=123\n"
                "FACEBOOK_USER_ACCESS_TOKEN=test-user-token\n",
                encoding="utf-8",
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

        result = client.get_json("https://graph.facebook.com/v21.0/test", "token")

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

    def test_paging_url_drops_access_token_and_rejects_other_hosts(self) -> None:
        value = sync.sanitize_paging_url(
            "https://graph.facebook.com/v21.0/1/posts?after=abc&access_token=secret"
        )
        self.assertEqual(
            value, "https://graph.facebook.com/v21.0/1/posts?after=abc"
        )
        with self.assertRaises(sync.GraphAPIError):
            sync.sanitize_paging_url("https://example.com/steal?after=abc")
        with self.assertRaises(sync.GraphAPIError):
            sync.sanitize_paging_url(
                "https://graph.facebook.com:444/v21.0/1/posts?after=abc"
            )


if __name__ == "__main__":
    unittest.main()

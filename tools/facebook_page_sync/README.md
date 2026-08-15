# Facebook Page post sync

This standalone Python 3 tool synchronizes posts from Facebook Pages managed by
the token owner through the official Meta Graph API **v21.0**. It does not read
Facebook Groups, reuse browser cookies, or store access tokens in SQLite.

## What it does

- Reads Page IDs and a long-lived user access token from a local `.env` file.
- Calls `GET /me/accounts` and follows `paging.next` to obtain Page access
  tokens for the requested Pages.
- Calls `GET /{page-id}/posts` with:

  ```text
  id,message,created_time,permalink_url,full_picture,
  shares,reactions.summary(true),comments.summary(true)
  ```

- Follows cursor pagination until `paging.next` is absent.
- Retrieves every Page-authored post returned by this edge. Meta documents an
  approximate limit of 600 ranked, published posts per year and does not return
  expired posts, so this is not guaranteed to be a complete historical archive.
- Stores posts in SQLite and checkpoints the latest `created_time` per Page.
- Supplies `since=<last-created-time-minus-one-second>` on subsequent runs.
  The one-second boundary overlap plus post-ID upsert prevents a same-second
  post from being missed while older records are not fetched.
- Parses `X-App-Usage` and `X-Business-Use-Case-Usage` response headers,
  including converting `estimated_time_to_regain_access` from minutes to
  seconds for capped retry backoff.
- Retries Graph error codes `4`, `17`, `32`, `613`, and the Pages
  business-use-case throttle code `80001`; HTTP `429`; transient Graph errors;
  transport errors; and HTTP `5xx` responses with exponential backoff and full
  jitter. `Retry-After` is respected when present.
- Rolls back a failed Page sync and continues with the remaining Pages.
- Emits one structured JSON log object per line. Tokens and query strings are
  never logged.

## Setup

No third-party Python packages are required. Python 3.11 or later is
recommended.

```bash
cd tools/facebook_page_sync
cp .env.example .env
```

Edit `.env`:

```dotenv
FACEBOOK_PAGE_IDS=123456789012345,987654321098765
FACEBOOK_USER_ACCESS_TOKEN=your_long_lived_user_token
FACEBOOK_SQLITE_PATH=../../data/facebook-page-posts.sqlite3
```

The token must belong to a Facebook user who has the necessary task access to
every requested Page. The script expects an already long-lived user token; it
does not accept an App Secret or perform the short-lived-to-long-lived token
exchange. Meta says long-lived user tokens generally last about 60 days but can
expire earlier, so replace the token and re-run if Graph returns OAuth error
code `190`.

The API version is deliberately pinned to `v21.0` as requested. Meta currently
labels v21 as outdated, so check its changelog and test a supported version
before Meta retires this one.

Run a sync:

```bash
python3 sync.py
```

Export the complete SQLite dataset to the default CSV path:

```bash
python3 sync.py --export-csv
```

Or select an output path:

```bash
python3 sync.py --export-csv ../../data/facebook-page-posts.csv
```

Useful overrides:

```bash
python3 sync.py \
  --database ../../data/facebook-page-posts.sqlite3 \
  --timeout 30 \
  --max-attempts 6 \
  --base-backoff 1 \
  --max-backoff 60 \
  --log-level INFO
```

The process exits with status `1` after attempting all Pages if any requested
Page failed. Configuration errors use status `2`.

## SQLite schema and incremental behavior

`posts` contains one row per Graph post ID:

- `post_id`, `page_id`, `page_name`
- `message`, `created_time`, `permalink_url`, `full_picture`
- `shares_count`, `reactions_count`, `comments_count`
- `synced_at`

`page_sync_state` stores `last_created_time` and
`last_successful_sync_at` independently for every Page. A checkpoint is updated
only after all pages of that Page's response have completed. A mid-run error
rolls back that Page without affecting Pages already completed.

Only the requested post fields and aggregate counts are stored; response data
for individual reactions or comments is deliberately discarded.

The CSV is written atomically as UTF-8 with a BOM for spreadsheet
compatibility. Cells beginning with `=`, `+`, `-`, or `@` are prefixed with an
apostrophe to prevent formula injection. SQLite retains the original requested
field values; the complete raw Graph response is deliberately not persisted.
The export path is rejected if it would overwrite the SQLite database or its
WAL, shared-memory, or rollback-journal files.

## Required Meta permissions

Request these permissions on the long-lived user access token:

- `pages_show_list` — lets `/me/accounts` return Pages the user manages.
- `pages_read_engagement` — reads Page-authored content and engagement data.
- `pages_read_user_content` — reads user-generated posts, comments, and ratings
  associated with a Page. It is part of the requested permission set, but
  Page-authored `/posts` alone normally falls under `pages_read_engagement`;
  request this only when the product has a real user-content feature.

The user must also have an appropriate Page task/role. Permissions do not grant
access to Pages the user does not manage.

Official references:

- [Page access tokens and `/me/accounts`](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens#pagetokens)
- [Graph API v21.0 user accounts edge](https://developers.facebook.com/docs/graph-api/reference/v21.0/user/accounts/)
- [Graph API v21.0 Page feed/posts reference](https://developers.facebook.com/docs/graph-api/reference/v21.0/page/feed/)
- [Graph API v21.0 Post fields](https://developers.facebook.com/docs/graph-api/reference/v21.0/post/)
- [Graph API pagination](https://developers.facebook.com/docs/graph-api/results/)
- [Graph API rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
- [Graph API v21.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version21.0/)
- [`pages_show_list`](https://developers.facebook.com/docs/permissions#pages_show_list),
  [`pages_read_engagement`](https://developers.facebook.com/docs/permissions#pages_read_engagement),
  and [`pages_read_user_content`](https://developers.facebook.com/docs/permissions#pages_read_user_content)
- [App Review submission guide](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide)

## App Review and Advanced Access

For a production app used by people outside the app's roles, complete the
following in the Meta App Dashboard:

1. Create or select the Meta app owned by the verified business and add the
   appropriate Facebook Login product/use case.
2. Configure the app domain, privacy-policy URL, terms URL where applicable,
   and a working user-data deletion callback or instructions.
3. In **App Review → Permissions and Features**, request Advanced Access for
   `pages_show_list`, `pages_read_engagement`, and
   `pages_read_user_content`.
4. Complete Business Verification and Meta's data-handling questions when the
   dashboard requires them.
5. For each permission, explain why the feature cannot work without it and how
   the retrieved Page data is stored, used, retained, and deleted.
6. Supply reviewer access instructions, any non-Facebook product credentials
   needed to enter the app, and reproducible sample content. Do not provide
   personal Facebook credentials. The screencast should demonstrate each
   permission:
   - `pages_show_list`: show the complete Facebook Login/grant flow and the
     Pages returned by `/me/accounts` being connected or selected.
   - `pages_read_engagement`: retrieve a Page-authored post and show its content
     and engagement totals in the SQLite/CSV-backed product surface.
   - `pages_read_user_content`: create or identify a user-generated Page
     comment, then show that comment being read and displayed. This script only
     stores `comments_count`; if the submitted product does not actually read
     user-generated content, Meta may reject this permission. Add a real
     reviewer-visible UGC feature or omit the permission outside this requested
     integration scope.
7. Submit the requested permissions, resolve reviewer feedback, and switch the
   app to Live only after approval. Keep the annual Data Use Checkup and token
   lifecycle requirements current.

App roles can usually test while an app is in Development mode, but that does
not replace Advanced Access/App Review for a production integration.

Before submitting, make at least one successful API call that exercises each
requested Advanced Access permission within the preceding 30 days. Meta notes
that the dashboard can take up to two days to reflect those calls. Use separate,
specific justification and end-to-end screencast evidence for each permission.

## Tests

Tests use synthetic responses only and never call Meta:

```bash
python3 -m unittest discover -s tests -v
```

Do not commit `.env`, access tokens, SQLite databases, WAL files, or CSV
exports.

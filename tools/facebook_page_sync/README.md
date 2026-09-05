# Facebook Page post sync

This standalone Python 3 tool synchronizes posts from Facebook Pages managed by
the token owner through the official Meta Graph API. The default version is
**v26.0**. It does not read Facebook Groups, reuse browser cookies, or store
access tokens in SQLite.

## Authorized contact-preserving DEV imports

Add `--preserve-contacts` to the combined DEV command when the user authorizes
retaining Page contacts. Use it for both dry-run and apply, together with an
approved `--retention-days` value. The importer stores the complete original
message in `sourceMessage`, preserves contact routes in the summary, and sets
`redactionState: contacts_preserved`. This option overrides the redacted-only
staging descriptions below; the default still redacts. Logs contain counts only.
The unique source identity and pending-review status remain unchanged. Changes
to the full original message trigger re-review, even beyond the summary limit.
Switching back to the default removes `sourceMessage` on an eligible refresh.

## What it does

- Reads Page IDs and a long-lived user access token from a local `.env` file.
- Calls `GET /me/accounts` and follows `paging.next` to obtain Page access
  tokens for the requested Pages.
- Uses the configured Graph API version for every newly constructed request and
  rejects a `paging.next` URL that switches to a different version.
- Calls `GET /{page-id}/posts` with:

  ```text
  id,message,created_time,permalink_url,full_picture,
  shares,reactions.summary(true),comments.summary(true)
  ```

- Follows cursor pagination until `paging.next` is absent.
- Retrieves every Page-authored post returned by this edge within the active
  lookback or incremental window. Meta documents an approximate limit of 600
  ranked, published posts per year and does not return expired posts, so this
  is not guaranteed to be a complete historical archive.
- Stores posts in SQLite and checkpoints the latest `created_time` per Page.
- Supports an initial lookback window. The supplied `.env.example` uses 14
  days, so a fresh database only receives posts from the preceding rolling
  14-day UTC window. Every Page in one run shares the same cutoff instant.
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
  never logged, and raw Page display names are omitted.
- Rejects every HTTP redirect so an authorization header is never forwarded to
  a redirect target.
- Requires Python 3.11 or later, sets process `umask 077`, requires the local
  `.env` to be a regular current-user-owned `0600` file, and forces the SQLite
  database file to mode `0600`.

## Setup

No third-party Python packages are required. Python 3.11 or later is required.

```bash
PYTHON_BIN="$(command -v python3)"
"$PYTHON_BIN" --version
cd tools/facebook_page_sync
umask 077
cp .env.example .env
chmod 600 .env
```

The script refuses to read an `.env` that is a symlink, hard-linked,
non-regular file, owned by another user, or has permissions other than exactly
`0600`.

Edit `.env`:

```dotenv
FACEBOOK_PAGE_IDS=123456789012345,987654321098765
FACEBOOK_USER_ACCESS_TOKEN=your_long_lived_user_token
FACEBOOK_GRAPH_API_VERSION=v26.0
FACEBOOK_INITIAL_LOOKBACK_DAYS=14
FACEBOOK_SQLITE_PATH=../../data/private-runs/facebook-pages/posts.sqlite3
```

The token must belong to a Facebook user who has the necessary task access to
every requested Page. The script expects an already long-lived user token; it
does not accept an App Secret or perform the short-lived-to-long-lived token
exchange. Meta says long-lived user tokens generally last about 60 days but can
expire earlier, so replace the token and re-run if Graph returns OAuth error
code `190`.

The default API version is `v26.0`, current as of 2026-09-01. Set
`FACEBOOK_GRAPH_API_VERSION` or pass `--graph-api-version` to use another
supported version. The CLI flag takes precedence over the environment file.
Versions must use Meta's `v<major>.0` format. Recheck Meta's changelog and test
the configured version before every production deployment.

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
  --database ../../data/private-runs/facebook-pages/posts.sqlite3 \
  --graph-api-version v26.0 \
  --run-id 123e4567-e89b-12d3-a456-426614174000 \
  --initial-lookback-days 14 \
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
`last_successful_sync_at` independently for every Page. When `--run-id` is
provided, the same transaction also stores it as `last_successful_run_id`.
Run IDs must be 1–128 safe-token characters and are intended for an orchestrator
to identify exactly which Pages succeeded in its run. Existing version-1
SQLite files are migrated in place to schema version 2. A checkpoint is updated
only after all pages of that Page's response have completed. A mid-run error
rolls back that Page without affecting Pages already completed.

`FACEBOOK_INITIAL_LOOKBACK_DAYS` only applies when that Page has no checkpoint.
After the first successful run, the saved checkpoint takes precedence. Remove
the setting before the first run if you want every historical post the API can
return. Changing the setting does not delete older rows from an existing
database.

Only the requested post fields and aggregate counts are stored; response data
for individual reactions or comments is deliberately discarded.

The CSV is written atomically as UTF-8 with a BOM for spreadsheet
compatibility. Cells whose first non-whitespace／control character is `=`, `+`,
`-`, or `@` are prefixed with an apostrophe to prevent formula injection,
including values hidden behind tabs or line breaks. SQLite retains the original
requested field values; the complete raw Graph response is deliberately not
persisted. The export path is rejected if it would overwrite the SQLite
database or its WAL, shared-memory, or rollback-journal files.

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
- [Graph API v26.0 user accounts edge](https://developers.facebook.com/docs/graph-api/reference/v26.0/user/accounts/)
- [Graph API v26.0 Page feed/posts reference](https://developers.facebook.com/docs/graph-api/reference/v26.0/page/feed/)
- [Graph API v26.0 Post fields](https://developers.facebook.com/docs/graph-api/reference/v26.0/post/)
- [Graph API pagination](https://developers.facebook.com/docs/graph-api/results/)
- [Graph API rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
- [Graph API v26.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version26.0/)
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

## Import redacted posts to the DEV database

From the repository root, the combined command first runs this Python sync and
then derives redacted staging records for MongoDB. It defaults to zero MongoDB
writes:

```bash
npm run db:sync:facebook-pages -- --retention-days 30
```

Apply only after reviewing the count-only dry-run:

```bash
npm run db:sync:facebook-pages -- --apply --retention-days 30
```

Replace `30` with the approved retention period for that run. It must be at
least as long as the delivery window (`7` days by default). The importer fails
closed unless both the configured database and the database in
`MONGODB_URI` are exactly `hotfix_dev`. It stores only a redacted summary,
source identity, redacted Page name, permalink, explicit money text, detected
contact types, aggregate engagement, timestamps, hashes, and review／retention
states in `externalUnverifiedLeads`. It never copies the raw Page message or
supported direct-contact patterns to MongoDB and never writes `serviceCases`.
Content changes atomically reset verification, lawful-use, and outreach states.
MongoDB enforces `expiresAt` with a TTL index and a refresh cannot extend an
existing expiry or revive a deleted／expired record.

The combined command supplies an exact run ID so a failed Page cannot reuse an
older checkpoint as current data. On a Page's first combined run it bounds the
raw source lookback to 14 days, the wider delivery window, or a shorter approved
retention period as applicable; it never requests an unbounded initial archive.
It restricts SQLite to a direct child of the
ignored, owner-only `data/private-runs/facebook-pages/` directory, serializes
local runs with a lock, and securely deletes／vacuums expired rows plus rows for
Pages removed from the configured allowlist. The SQLite cache still contains
raw Page messages inside the approved retention window; never commit or share
it. The standalone Python command does not perform this combined-import prune.

## Tests

Tests use synthetic responses only and never call Meta:

```bash
python3 -m unittest discover -s tests -v
```

Do not commit `.env`, access tokens, SQLite databases, WAL files, or CSV
exports.

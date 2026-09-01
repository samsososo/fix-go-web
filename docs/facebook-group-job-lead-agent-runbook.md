---
document_kind: ai_agent_runbook
scope: hong_kong_facebook_job_leads
status: internal_prototype
last_updated: 2026-09-01
canonical_group_contact_policy: redacted
human_document: docs/facebook-group-job-lead-workflow.zh-HK.md
---

# AI Agent Runbook: Hong Kong Facebook Job Leads

This runbook tells an AI coding agent how to continue the current Facebook job-lead work without changing product billing rules, leaking personal data, confusing Facebook Pages with Groups, or turning a supervised research task into unauthorized automated collection.

Normative terms `MUST`, `MUST NOT`, `SHOULD`, and `STOP` are deliberate.

## 1. Read before acting

The agent MUST read, in this order:

1. `AGENTS.md`
2. `docs/business-rules.zh-HK.md`
3. `docs/facebook-group-job-lead-workflow.zh-HK.md`
4. `tools/facebook_page_sync/README.md` only when the source is a managed Facebook Page

The agent MUST treat `docs/business-rules.zh-HK.md` as the product/business source of truth. An external Facebook lead is not a formal `ServiceRequest`, quote, booking, or permission to bypass pro subscription entitlements.

## 2. Non-negotiable rules

The agent MUST:

- keep Group canonical JSON, CSV, SQLite, logs, docs, commits, chat summaries, and terminal summaries free of raw phone numbers and email addresses;
- use `[PHONE]` and `[EMAIL]` in canonical datasets;
- store timestamps in UTC and interpret Hong Kong human date labels using `Asia/Hong_Kong`;
- require an explicit source allowlist and a fixed `source_generated_at` before applying a time window;
- preserve a stable source identity for every candidate;
- keep Facebook data and generated spreadsheets out of Git;
- require explicit user or authorized-human sign-off for 100% of final candidates while this is an internal prototype, and report `pending_human_review` until that sign-off exists;
- use synthetic fixtures only if tests are added to Git.

The agent MUST NOT:

- build or run an unattended Facebook Group crawler without documented Meta permission for that collection;
- use Playwright, browser bots, crawlers, or any programmatic browser navigation to collect Facebook Group data without documented Meta express written permission, even if the run is low-volume, supervised, or uses the user's own signed-in account;
- implement stealth, fingerprint spoofing, proxy rotation, randomized evasion, CAPTCHA bypass, account-challenge bypass, or any method intended to avoid Facebook detection;
- extract cookies, browser storage, access tokens, hidden endpoints, or credentials from a signed-in session;
- reuse the managed-Page Graph API tool as a Facebook Group scraper;
- infer a hidden phone number, email address, salary, location, identity, or work detail;
- send WhatsApp, SMS, email, Facebook PM, comments, calls, or promotional messages as part of this workflow;
- use Meta Platform Data to decide whether a person is eligible for employment, should be hired, or should receive particular employment terms;
- write raw contact data to stdout or any user-visible progress update;
- stage or commit `data/`, screenshots, SQLite files, CSV exports, Excel files, `.env`, access tokens, or private contact mappings.

If a user requests automated collection designed to avoid detection, the agent MUST refuse that method and offer the official API, a user-provided export, user-performed manual capture, or an explicitly authorized bounded review instead.

## 3. Source router

Choose exactly one route before collecting data:

| Condition                                                                                                        | Route                         | Allowed action                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The user manages the Page and has a valid user access token                                                      | `managed_page_graph_api`      | Use `tools/facebook_page_sync/` and the documented official Graph API flow                                                                 |
| The content is in a Facebook Group and no Meta automated-collection authorization is documented                  | `offline_input`               | Ask the user to browse manually and supply an export, screenshots, or specific source files; process them offline                          |
| The content is in a Facebook Group and Meta express written authorization covering this collection is documented | `group_authorized_collection` | Follow the written scope exactly; use only visible, read-only collection and the controls below                                            |
| The user supplies JSON, CSV, SQLite, screenshots, or Excel                                                       | `offline_input`               | Process locally; if a field needs Facebook verification, ask the user unless documented Meta authorization permits agent-controlled access |
| Source type, permission, account ownership, or requested scope is unclear                                        | none                          | `STOP` and ask for clarification                                                                                                           |

Never claim the Page API can read arbitrary Pages or Groups. `GET /me/accounts` only resolves Pages available to the authorized user and the current tool does not implement Group access.

Meta removed the Groups API and related permissions for all API versions from 2024-04-22. Do not search for an older Graph API version as a workaround. The official reference is the [Graph API v19.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version19.0/).

## 4. Required run parameters

Before a new run, record these values in a private run manifest. Do not hardcode them in docs:

```yaml
run_id: <non-personal identifier>
source_kind: managed_page_graph_api | group_authorized_collection | offline_input
source_generated_at: <ISO-8601 UTC instant>
source_ui_timezone: <verified source UI timezone>
display_timezone: Asia/Hong_Kong
source_window_days: 14
delivery_window_days: 7
group_allowlist: [<explicit group ids>] # group route only
page_allowlist: [<explicit page ids>] # page route only
output_columns: [title, 工作內容, 聯絡方式, 錢]
raw_contact_delivery_authorized: false | true
meta_automated_collection_authorization: absent | <non-secret approval reference>
```

`source_generated_at` MUST be fixed for the entire run. The 7-day cutoff is:

```text
window_start_inclusive = source_generated_at - exactly 7×24 hours
window_end_inclusive   = source_generated_at
```

Do not recompute the cutoff from the current clock during a retry.

## 5. Preflight

Run read-only checks first:

```bash
git branch --show-current
git status --short --branch
git remote -v
```

Requirements:

- Branch is `master`, unless the user explicitly instructs otherwise.
- Unrelated working-tree changes are preserved and not staged.
- The source type and allowlist are explicit.
- The signed-in account, if browser review is needed, already has legitimate access.
- No credential needs to be pasted into chat or committed.
- Output paths are private or ignored.

For a run that may touch screenshots or public contact values, establish owner-only defaults before creating files:

```bash
RUN_ID="replace-with-non-personal-run-id"
PRIVATE_RUN_DIR="$PWD/data/private-runs/$RUN_ID"
umask 077
mkdir -p "$PRIVATE_RUN_DIR"
chmod 700 "$PRIVATE_RUN_DIR"
touch "$PRIVATE_RUN_DIR/.privacy-probe"
chmod 600 "$PRIVATE_RUN_DIR/.privacy-probe"
if ! git check-ignore -q -- "$PRIVATE_RUN_DIR/.privacy-probe"; then
  rm -- "$PRIVATE_RUN_DIR/.privacy-probe"
  printf '%s\n' 'STOP: private run directory is not ignored by Git' >&2
  exit 1
fi
rm -- "$PRIVATE_RUN_DIR/.privacy-probe"
```

Run the entire block in one shell. A later Codex shell call does not inherit the earlier `umask`, so every command that creates private files must set `umask 077` in that same shell and then verify file permissions with `stat`. If `git check-ignore` fails, `STOP` and choose or configure a properly ignored path. Do not rely on a developer's unshared `.git/info/exclude` entry.

For the local Group prototype, also check:

```bash
PYTHON_BIN="$(command -v python3)"
"$PYTHON_BIN" --version
tesseract --version
tesseract --list-langs
"$PYTHON_BIN" -c "from PIL import Image; print('Pillow available')"
```

Python MUST be 3.11 or later, and `eng` must be available to the current OCR prototype. Resolve and keep the absolute Python path before changing directories because a different working directory may select a different interpreter. Do not install or change system packages silently; report a missing dependency.

## 6. Path contract

Current Group prototype paths are local artifacts, not a tracked repository API:

```text
data/facebook-group-posts-14d.partial.json
data/_finalize_facebook_group_posts.py
data/facebook-group-posts-14d.json
data/facebook-group-posts-14d.csv
data/facebook-group-posts-14d.sqlite3
data/facebook-group-posts-14d.qa.json
data/_extract_job_leads_7d.py
data/facebook-job-leads-7d.intermediate.json
data/facebook-job-leads-7d.selected.json
outputs/<run-id>/<private-workbook>.xlsx
```

Important:

- `data/` is ignored by the repository.
- The current `outputs/` protection may exist only in the local `.git/info/exclude`; it is not a portable guarantee.
- A clean clone or CI job will not contain the Group scripts or source artifacts.
- If a required ignored file is absent, `STOP`. Do not reconstruct a scraper from memory or silently substitute another source.

The managed Page tool is tracked and lives at:

```text
tools/facebook_page_sync/
```

## 7. Managed Page route

Use this route only for Pages the token owner manages.

```bash
PYTHON_BIN="$(command -v python3)"
"$PYTHON_BIN" --version # must be 3.11+
cd tools/facebook_page_sync
umask 077
test -e .env || cp .env.example .env
chmod 600 .env
# The user enters FACEBOOK_PAGE_IDS and FACEBOOK_USER_ACCESS_TOKEN locally;
# FACEBOOK_GRAPH_API_VERSION defaults to v26.0 as of 2026-09-01.
"$PYTHON_BIN" -m unittest discover -s tests -v
"$PYTHON_BIN" sync.py --export-csv
```

Rules:

- Never print or commit `.env`.
- Never persist Page access tokens.
- The tool stores the Page-authored `message` unchanged. Its SQLite/CSV outputs may therefore contain public contact data and MUST be handled as restricted source artifacts with owner-only permissions. If Page posts feed the Group-style lead workflow, create a separate redacted derived dataset first.
- Respect structured retry and rate-limit handling already implemented in `sync.py`.
- Treat one Page failure as isolated; do not discard successful Page transactions.
- Confirm the Graph API version is still supported before a new production deployment. The current default is configurable and set to `v26.0` as of 2026-09-01; it is not a permanent requirement.
- Follow `tools/facebook_page_sync/README.md` for permissions and App Review.

This route produces Page posts. It does not perform the Group lead classification below unless the user separately supplies a lawful Page-post dataset for that purpose.

For the DEV-only redacted staging importer, first configure the owner-only Page `.env`, choose an explicitly approved retention period, and run a MongoDB dry-run:

```bash
npm run db:sync:facebook-pages -- --retention-days 30
```

Only after reviewing the count-only result may an authorized operator apply the idempotent upsert:

```bash
npm run db:sync:facebook-pages -- --apply --retention-days 30
```

`30` is an example rather than an approved policy. Replace it with the approved period for the run; it MUST NOT be shorter than the delivery window. The command MUST fail unless the configured database and the database encoded in `MONGODB_URI` are both exactly `hotfix_dev`. It writes only supported-contact-pattern-redacted, `pending_human_review` records to `externalUnverifiedLeads`; it MUST NOT write `serviceCases`, create notifications, match pros, or expose raw Page messages. `expiresAt` is enforced by a single-field TTL index. Every combined run also uses secure deletion and `VACUUM` to prune raw SQLite rows older than the approved period and rows belonging to no-longer-configured Pages. Its SQLite path MUST remain directly inside the ignored, owner-only `data/private-runs/facebook-pages/` directory. A dry-run still refreshes and prunes that cache but performs zero MongoDB writes.

## 8. Group route

### 8.1 Authorization gate and browser boundary

Without a non-secret reference to Meta's express written authorization for the exact automated collection, the agent MUST NOT control a browser to collect Facebook Group data. The user may browse manually and provide files for offline processing.

If valid authorization is documented, the browser step remains a supervised, read-only research activity and MUST stay within the approved purpose, sources, fields, rate, retention period, and user population.

Allowed:

- open an explicitly approved Group already accessible to the signed-in user;
- inspect visible post text, date, permalink, and public contact method;
- use Group search to locate a specific known post;
- expand a visible `See more` section;
- capture only the minimum evidence needed for date or contact verification.

Not allowed:

- joining Groups, posting, commenting, messaging, or changing account state without a separate explicit request;
- infinite-scroll bulk extraction or background crawling;
- bypassing visibility restrictions, checkpoints, CAPTCHAs, login prompts, or deleted posts;
- reading cookies, local storage, session tokens, private network responses, or undocumented endpoints;
- disguising automation or attempting to reduce detectability.

If Facebook presents a login expiry, checkpoint, CAPTCHA, block, or permission error, `STOP` and let the user resolve it.

The 2026-08-15 browser-assisted snapshot is provenance for an existing local artifact only. It is not proof of Meta authorization and MUST NOT be treated as permission to repeat the collection.

### 8.2 Partial capture contract

A partial post record SHOULD contain:

```json
{
  "group_id": "<allowlisted id>",
  "group_name": "<display name>",
  "post_id": "<id or null>",
  "synthetic_id": "<deterministic id or null>",
  "permalink": "<url or null>",
  "author_display_name": "<redacted if needed>",
  "date_label": "<visible label or null>",
  "estimated_created_time": "<UTC ISO time or null>",
  "estimated_age_days": "<number or null>",
  "date_precision": "ocr_pending | relative_second | relative_minute | relative_hour | relative_day | relative_week | exact_minute | exact_day | unknown",
  "needs_date_review": true,
  "message": "<text with contacts redacted>",
  "media_description": "<minimal redacted text>",
  "message_truncated": false,
  "contact_redacted": true,
  "contact_types": ["phone", "whatsapp"],
  "ocr_image_path": "<private path when OCR is needed>",
  "ocr_crop": null,
  "captured_at": "<UTC ISO time>",
  "source": "facebook_in_app_browser_assisted"
}
```

Never use the row position as identity. After normalization, every row MUST have `stable_id`, derived from a real post ID where available or from deterministic source fields.

`ocr_image_path` is required when date OCR depends on a screenshot. When present, `ocr_crop` MUST be an object with integer `left`, `top`, `width`, and `height` fields; otherwise it is `null`. The image path and crop metadata are private provenance and must not be committed.

Treat the whole partial file and every source screenshot as restricted data. Do not trust a `privacy` or `contact_redacted` flag without scanning the actual content; the current local partial snapshot contains contact-like raw values even though downstream canonical outputs are redacted.

### 8.3 Normalize the 14-day source

The current local prototype command is:

```bash
PYTHON_BIN="$(command -v python3)"
umask 077
"$PYTHON_BIN" data/_finalize_facebook_group_posts.py \
  --input data/facebook-group-posts-14d.partial.json \
  --json data/facebook-group-posts-14d.json \
  --csv data/facebook-group-posts-14d.csv \
  --sqlite data/facebook-group-posts-14d.sqlite3 \
  --qa data/facebook-group-posts-14d.qa.json
```

However, the current script hardcodes `Europe/London` and uses a hardcoded `2026` year for some labels that omit a year. For any new Hong Kong run, the agent MUST `STOP` while either behavior remains. The script must first be changed, reviewed, and tested to use the verified source UI timezone, `Asia/Hong_Kong` reporting time, the capture reference year, and explicit cross-year boundary handling; that implementation is outside this documentation-only change.

The finalizer also hardcodes two group IDs in `GROUP_NAMES`. Before running, compare the run manifest allowlist, the unique input `group_id` values, and the finalizer's supported IDs. They MUST be exactly equal; otherwise `STOP`.

Successful normalization requires:

- all source groups are in the explicit run allowlist;
- known out-of-window rows are filtered;
- unknown dates are retained only in the review dataset and marked `needs_date_review`;
- duplicate `stable_id` and duplicate `group_id + post_id` counts are zero;
- supported-pattern raw contact leakage count is zero, followed by a broader normalized privacy scan and manual spot check that output counts only;
- only parsed date labels, not raw OCR output, are persisted;
- the four outputs are created atomically where supported.

The current Group CSV writer does not escape user text beginning with `=`, `+`, `-`, or `@`. Until that implementation is fixed and tested, treat the CSV only as restricted machine input and do not open it directly in Excel or another spreadsheet application.

### 8.4 Apply the strict 7-day filter

The current local prototype command is:

```bash
PYTHON_BIN="$(command -v python3)"
umask 077
"$PYTHON_BIN" data/_extract_job_leads_7d.py \
  --source data/facebook-group-posts-14d.json \
  --output data/facebook-job-leads-7d.intermediate.json
```

The current extractor chooses the first two group IDs by source appearance order. This is not a durable scope contract. For a new run, the agent MUST compare those selected IDs with the explicit run allowlist and `STOP` unless the two sets are exactly equal; the durable fix is to make the allowlist a required configuration input and add tests.

The current extractor also requires a contact signal in the post text and does not treat a valid permalink as a contact fallback. The final human selection rule does allow an accessible permalink. Therefore the automatic candidate file is only an input to review, not a reproducible final selection. Do not silently replace one with the other; the durable fix is a tested permalink-fallback rule plus an auditable selection manifest.

Before describing an output as the "latest 7 days", verify that its fixed `source_generated_at` is current for the requested run. A deterministic rerun of the 2026-08-15 snapshot is still stale data.

For `exact_day`, `relative_day`, or any other precision interval that crosses the 7-day cutoff, send that row to review and exclude it from the final deliverable. Comparing one estimated timestamp is not sufficient at the boundary.

Each candidate MUST have:

```json
{
  "title": "<non-empty concise title>",
  "job_content": "<non-empty factual work description>",
  "contact_method": "<non-empty usable method or permalink>",
  "money": "<explicit amount, range, pay expression, 面議, or null>",
  "source": {
    "stable_id": "<unique id>",
    "group_id": "<allowlisted id>",
    "group_name": "<name>",
    "estimated_created_time": "<UTC time inside window>",
    "permalink": "<url or null>"
  },
  "audit": {
    "decision": "included",
    "intent_type": "hiring | client_request | structured_job"
  }
}
```

Exclude job seekers, courses, product/material sales, property listings, supplier/service promotion without explicit demand, general discussion, missing dates, missing work detail, missing contact route, duplicates, and out-of-window posts.

The current classifier requires at least eight substantive characters after removing URLs, contact placeholders, whitespace, and punctuation. Treat that as a minimum mechanical check, not proof that the description is complete.

Redact contacts before extracting money. Otherwise, an eight-digit phone number can be misclassified as an amount. Preserve at most three unique, explicit salary/price/budget expressions, including an explicit `面議`, and never infer currency, pay period, tax treatment, or unit.

### 8.5 Manual candidate review

Review every candidate against the original visible post or preserved screenshot.

For each candidate, confirm:

- `stable_id` maps to exactly one source post;
- the date is inside the fixed 7-day window;
- the intent is a real work request or trade hiring post;
- the title and work content contain no invented facts;
- money is copied only when explicit and retains its unit or uncertainty;
- the contact method is usable;
- truncated content does not change the decision.

If a post is truncated and cannot be expanded, or its source mapping is ambiguous, reject it or place it in a separate review queue. Do not include it in the deliverable.

Create `data/selection-manifest.private.json` before Excel export. It MUST retain audit lineage without adding columns to the user-facing workbook:

```json
{
  "source_file": "facebook-group-posts-14d.json",
  "input_sha256_algorithm": "sha256",
  "input_sha256": "<digest>",
  "extractor_version": "<version>",
  "rows": [
    {
      "lead_index": 1,
      "worksheet_row": 5,
      "stable_id": "<id>",
      "group_id": "<allowlisted id>",
      "estimated_created_time": "<UTC instant>",
      "permalink": "<url or null>",
      "screenshot_reference": "<private relative reference or null>",
      "contact_source": "post_text | screenshot | permalink",
      "contact_route_verified": true,
      "raw_contact_visually_verified": "<true for a direct value; null for permalink-only>",
      "non_contact_row_sha256": "<digest of title, work content, and money>",
      "agent_review_status": "passed | rejected",
      "human_review_status": "pending | approved | rejected",
      "human_reviewed_at": "<UTC instant or null>"
    }
  ]
}
```

The manifest MUST NOT contain the raw contact value. `lead_index` is the one-based lead ordinal, while `worksheet_row` is the actual one-based Excel worksheet row after title or metadata rows. Its row count, lead order, worksheet-row mapping, and `stable_id` order must match the private Excel rows. An AI agent MUST leave `human_review_status` as `pending` unless the user or another authorized human reviewer explicitly signs off; AI review alone is not human review.

### 8.6 Public contact enrichment

Group canonical datasets stay redacted. Only perform this step when the user explicitly authorizes a private deliverable containing public contact details.

Process:

1. Match by `stable_id`, never by row number alone.
2. Open the corresponding original post or preserved screenshot.
3. Copy only a contact value that is clearly visible to the signed-in user and explicitly attached to that post.
4. Require exactly one unambiguous candidate for an automatic mapping. More than one candidate means `STOP` for manual review.
5. Write the mapping to a short-lived ignored file, set the file to mode `0600`, and verify its parent directory is mode `0700`.
6. Print only aggregate counts and boolean validation results.
7. Update only the private Excel deliverable; never write raw values back into canonical JSON, CSV, SQLite, docs, or Git.
8. Delete temporary OCR text, mapping files, inspect dumps, browser text exports, rendered PNG／PDF previews, and any redacted QA clone after the workbook passes QA.

New private files SHOULD be mode `0600` and their parent directory SHOULD be mode `0700`. A successful Git ignore check is not a substitute for filesystem permissions.

Do not restore information hidden by the author or Facebook. Do not publish raw contact values in the agent response.

### 8.7 Excel export contract

When running inside Codex, the agent MUST load and follow the spreadsheet skill before editing an `.xlsx` file, and use the prescribed spreadsheet artifact library.

Workbook contract:

- one worksheet named `7日工作`;
- exactly four user-visible columns in this order: `Title`, `工作內容`, `聯絡方式`, `錢（optional）`;
- one lead per row;
- phone numbers stored as text, never numeric values;
- `錢` may be blank;
- no formulas are required;
- strings beginning with `=`, `+`, `-`, or `@` must not be allowed to become spreadsheet formulas;
- the workbook must not contain `[PHONE]`, `[EMAIL]`, or `號碼已遮蔽` after authorized private enrichment;
- file name and metadata must not contain contact data.

For a literal cell beginning with `=`, `+`, `-`, or `@`, write a text-safe value such as an apostrophe-prefixed string and verify the reimported cell has no formula.

Canonical candidate JSON uses `title`, `job_content`, `contact_method`, and `money`. The current private selection payload instead uses `title`, `工作內容`, `聯絡方式`, and `錢`; normalize either shape to the fixed Excel mapping below before export:

| Canonical candidate field | Current private-selection field | Excel column     |
| ------------------------- | ------------------------------- | ---------------- |
| `title`                   | `title`                         | `Title`          |
| `job_content`             | `工作內容`                      | `工作內容`       |
| `contact_method`          | `聯絡方式`                      | `聯絡方式`       |
| `money`                   | `錢`                            | `錢（optional）` |

`non_contact_row_sha256` is the SHA-256 digest of a documented canonical serialization of the normalized `title`, work-content, and money fields only; it MUST exclude the contact value.

Verification sequence:

1. Import the final workbook again.
2. Confirm sheet count, sheet name, row count, column order, and non-empty required fields.
3. Scan all cells for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, and `#N/A`.
4. Confirm the expected number of contact-bearing rows without printing the values.
5. Render visual QA only inside the owner-only private run directory. Prefer a clone that replaces each contact with an equal-length placeholder, or render only non-contact ranges. Never return a contact-bearing preview in chat.
6. Delete every generated preview, QA clone, and `.inspect.ndjson` file after verification, whether or not a quick scan found private data.

## 9. QA gates

### 9.1 Automated invariants

The run MUST fail if any hard invariant is false:

```json
{
  "required_fields_non_empty": true,
  "money_is_optional": true,
  "duplicate_stable_ids": 0,
  "duplicate_group_post_ids": 0,
  "unknown_dates_in_final_7d": 0,
  "out_of_window_rows_in_final_7d": 0,
  "groups_outside_allowlist": 0,
  "supported_pattern_contact_leaks_in_group_canonical_outputs": 0,
  "source_timestamp_matches_manifest": true,
  "selection_manifest_excel_row_count_matches": true
}
```

Current local checks that do not print post bodies or contact values:

```bash
SOURCE_GENERATED_AT="replace-with-manifest-utc-instant"
shasum -a 256 data/facebook-group-posts-14d.json
jq -e '.validation | to_entries | all(.value == true)' \
  data/facebook-group-posts-14d.qa.json
jq -e --arg source_time "$SOURCE_GENERATED_AT" \
  '.source_generated_at == $source_time' \
  data/facebook-group-posts-14d.json
jq -e --arg source_time "$SOURCE_GENERATED_AT" '
  .source_generated_at == $source_time and
  .qa.raw_contact_leak_count == 0 and
  .qa.required_field_failure_count == 0 and
  .qa.duplicate_candidate_identity_count == 0 and
  .window.days == 7
' data/facebook-job-leads-7d.intermediate.json
sqlite3 data/facebook-group-posts-14d.sqlite3 \
  'SELECT COUNT(*) = COUNT(DISTINCT stable_id) FROM group_posts;'
```

The existing contact check covers only supported patterns. A second, broader normalized privacy scanner must output counts and file paths only, never matches. All Group canonical artifacts remain restricted personal-data artifacts even when the automated leak count is zero; managed-Page outputs are restricted raw-source artifacts because their messages are not redacted.

### 9.2 Manual attestations

These checks require user or authorized human judgment and MUST NOT be labelled machine-verified:

```json
{
  "no_inferred_contact_values": true,
  "no_inferred_money_values": true,
  "truncated_candidates_verified_or_removed": true,
  "contact_routes_verified": true,
  "human_review_status": "approved"
}
```

Until human sign-off exists, report the run as `pending_human_review`, not complete.

Also report, without failing solely on the value:

```json
{
  "captured_by_source": {},
  "known_dates_in_source_window": 0,
  "unknown_date_count": 0,
  "message_truncated_count": 0,
  "missing_permalink_count": 0,
  "candidate_count": 0,
  "candidate_count_by_source": {},
  "candidates_with_money": 0,
  "rejection_reason_counts": {},
  "manual_false_positive_count": 0
}
```

## 10. Stop conditions

Immediately `STOP` and report a concise blocker when any of these occurs:

- login expired, CAPTCHA, account checkpoint, temporary block, or permission error;
- the requested Group or Page is not explicitly authorized or allowlisted;
- automation would require bypass, evasion, hidden APIs, cookie extraction, or unauthorized collection;
- the requested use would make an employment eligibility, hiring, or employment-terms decision from Meta Platform Data;
- the required source artifact or local prototype script is missing;
- the current script still uses `Europe/London` for a new Hong Kong run;
- the current date parser still hardcodes a calendar year for a new run;
- the manifest allowlist, input groups, and finalizer-supported groups are not identical;
- the group IDs selected by source ordering do not exactly equal the explicit allowlist;
- the global `source_generated_at`, cutoff, or source UI timezone cannot be determined;
- the user requests the latest 7 days but only a stale snapshot is available;
- a post is materially truncated and cannot be verified;
- a `stable_id` maps to zero or multiple source posts;
- contact extraction yields zero or multiple candidates where a direct contact is required;
- a raw contact appears in a Group canonical output, logs, docs, Git diff, or chat;
- a new Group CSV would be opened in spreadsheet software before formula-injection hardening is implemented and tested;
- unrelated working-tree changes overlap the files that must be modified;
- a test, QA check, commit, or push fails.

Difficulty, low yield, or slow review are not permission to lower the hard gates.

An individual row with an unknown or cutoff-crossing date does not stop the whole run: place it in review and exclude it from the final 7-day deliverable. If such a row reaches the final selection, final QA MUST fail.

## 11. Product handoff boundary

The repository now has a DEV-only `externalUnverifiedLeads` staging collection for redacted managed-Page imports. It is deliberately outside `MockDb` and the customer/pro repositories, and is not a product-visible lead, formal request, quote, booking, notification, or pro match. The agent MUST NOT insert Facebook leads directly into `ServiceRequest`.

The staging record retains:

- source and `stable_id`;
- captured and expiry times;
- redacted summary;
- verification state;
- lawful-use and outreach state;
- retention/deletion state;
- conversion link to a customer-created request, if consent is later obtained.

Its initial verification, lawful-use, and outreach states remain pending or unauthorized. A changed source fingerprint resets all three approval states and requires review again; a deletion／expiry state cannot be revived by a later sync. Any later conversion or distribution requires separately approved consent, deletion, and outreach rules and must call the same subscription entitlement checks used by native leads. External data cannot restore `canCreateQuotes` or `canAcceptNewWork` for a restricted pro.

## 12. Git and cleanup

Before committing documentation or code:

```bash
git status --short --branch
git diff --check
git diff --name-only
git diff --cached --name-only
git ls-files -- data outputs
```

Before printing a content diff, run a count-only privacy/secret scan over added and staged lines. The scanner must not print matches. If no such scanner is available, `STOP` rather than risk displaying a raw value. Only stage files intentionally changed for the task, and never use a broad staging command when private outputs exist.

After producing a private workbook:

- delete temporary contact maps, OCR text, browser text dumps, rendered PNG／PDF previews, QA clones, and inspect files created by the run;
- keep canonical redacted artifacts only for the approved retention period;
- do not delete user-owned source screenshots unless the user explicitly asks and the retention policy permits it;
- verify filesystem permissions and ignored paths directly; `git status` does not list ignored private artifacts.

Repository instructions require verified changes to be committed directly to `master` and pushed to `origin/master`. If push is rejected or conflicts appear, `STOP` and report the exact state.

## 13. Safe handoff format

Use this structure for agent-to-agent or final handoff. Omit post bodies and contact values.

```yaml
status: complete | pending_human_review | blocked
run_id: <id>
source_kind: <route>
source_generated_at: <UTC instant>
delivery_window:
  start_inclusive: <UTC instant>
  end_inclusive: <UTC instant>
allowlist_count: <number>
input_fingerprint: <sha256 or null>
counts:
  source_rows: <number>
  in_window_rows: <number>
  candidates: <number>
  private_contacts_verified: <number>
qa:
  hard_gates_passed: true | false
  duplicate_ids: <number>
  unknown_dates_in_final: <number>
  supported_pattern_contact_leaks_in_group_canonical_outputs: <number>
  human_review_status: pending | approved | rejected
output: <private local path or null>
temporary_private_files_removed: true | false
unresolved_items: []
```

## 14. Current snapshot for orientation only

The 2026-08-15 local prototype had:

- 146 partial input rows;
- 139 finalized rows;
- 121 known rows inside the 14-day window;
- 18 unknown-date rows retained for review;
- 68 truncated messages;
- 39 missing permalinks;
- 75 known rows inside the strict 7-day window across the two selected sources;
- 5 automatic candidates, 3 with explicit money;
- 3 private public contacts manually verified and 2 permalink-only contacts;
- zero duplicate IDs and zero supported-pattern raw-contact leakage in Group canonical outputs.

The private Excel also has 5 rows, but it is not the same set as the 5 automatic candidates. A reconstructed source mapping found only 2 overlapping `stable_id` values, while the current selected export payload stores no `stable_id` or source object. Do not claim that the current Excel is deterministically reproducible from `facebook-job-leads-7d.intermediate.json`.

These numbers are not targets. A future run must report its own counts against the hard gates above.

---
name: schema-discovery
description: Use before running any CS or admin database query against orders / leads / revision_requests, especially after admin schema changes or when a previous query failed with "column does not exist". Returns the current column list so downstream queries adapt instead of silently breaking.
---

# Schema Discovery

The `orders` table churns frequently (new upsell columns, bonus track fields, revision tracking, SMS fields). Hard-coded `SELECT col1, col2, ...` queries silently break when columns are renamed or dropped. **Always discover the schema first** when you're about to run a non-trivial CS query.

## When to use

- About to build a `SELECT` against `orders`, `leads`, or `revision_requests` and you're not 100% sure of every column name.
- A prior query just failed with `column "X" does not exist` or `column reference "Y" is ambiguous`.
- User reports admin / CS tooling broke after a schema change.
- Writing or updating a CS edge function (`cs-agent-actions`, `cs-agent-lookup`, `cs-draft-reply`) that depends on column shape.

## Discovery query

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'   -- or 'leads', 'revision_requests', etc.
ORDER BY ordinal_position;
```

Run via `supabase--read_query`. Cheap, read-only, no side effects.

## Workflow

1. Run the discovery query for each table you intend to touch.
2. Diff against the columns your draft query references.
3. For any missing column: check if it was renamed (look for a close match), moved to another table, or removed (revisit the user's request).
4. Only then run the real query.

## Common drift hot spots

- **Bonus track**: `bonus_song_url`, `bonus_preview_url`, `bonus_automation_status`, `bonus_unlocked_at`, `bonus_price_cents`, `bonus_email_sent_at`.
- **Lyrics upsell**: `lyrics_unlocked_at`, `lyrics_unlock_session_id`, `lyrics_price_cents`, `lyrics_word_count`.
- **Download upsell**: `download_unlocked_at`, `download_price_cents`.
- **Revisions**: `revision_token`, `revision_count`, `max_revisions`, `revision_status`, `pending_revision`.
- **Versioning**: `prev_song_url`, `prev_automation_lyrics`, `prev_cover_image_url`, `song_history` (jsonb).
- **Delivery**: `delivery_status`, `delivery_last_error`, `customer_email_override`, `customer_email_cc`, `sent_to_emails`.
- **Automation**: `automation_status`, `automation_task_id`, `automation_lyrics`, `automation_retry_count`, `short_retry_count`, `content_filter_strikes`, `auto_recovery_count`.
- **Pricing**: both `price` (legacy integer dollars) and `price_cents` (canonical) exist — prefer `price_cents` (memory `pricing-data-standard`).

## Do not

- Do not `SELECT *` in production CS responses — pull only what you need after discovery.
- Do not assume column names from older chat history or memory — confirm against the live schema.
- Do not run schema discovery for every trivial query (e.g. simple `SELECT id, customer_email`); reserve it for queries touching the churn-prone columns above.
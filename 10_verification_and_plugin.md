# Relay — live verification, and the Claude plugin

Two things happened here: the whole product was exercised against your real Supabase project
from your own browser, and Relay was packaged as a Claude plugin.

---

## What was verified against the live project

Not read, not reasoned about — executed against `tbibbqofgtdhacotlqcf.supabase.co` while you
were signed in.

| Feature | Result |
|---|---|
| Sign-in and session | Works — `yduan2435@gmail.com`, workspace "Yu Duan's workspace", role `owner` |
| Workspace auto-provisioning | Works — created on signup, plan `sandbox` |
| API key creation | Works — a `sk_test_` key was created, hashed, and accepted by the API |
| `POST /v1/reconcile` | Works — 405 on GET, 401 with no key, 401 with a fake key, 200 with a real one |
| Detection: `unissued_after_charge` | Correctly flagged, severity critical, right resolution |
| Detection: `duplicate_charge` + `price_drift` | Both flagged on one order |
| **Staying quiet on a clean order** | Correctly `cleared` with no flags — the case that matters most |
| Order storage per workspace | Works — all four test orders landed and are readable by you only |
| Console rendering | Works — orders, flags, verdicts, and the expandable three-view rows |
| Flag review loop | Works — "Correct" wrote a `flag_reviews` row |
| `flag_accuracy` view | Works — computed 100% precision on `duplicate_charge` from 1 review |
| Contact form | Works — a message saved to `contact_messages` |
| **RLS on the forms** | The row exists, and anonymous reads return `[]`. The write-only policy holds |
| **RLS on tenant data** | Anonymous cannot read `orders`, `workspaces`, `api_keys` or `webhooks` |
| All 12 migrations | Applied — every table and view is present |

### Test data left behind (safe to delete)

- Four orders: `e2e_unissued`, `e2e_multi`, `e2e_clean`, `e2e_pending`
- One contact message: "RELAY SELF-TEST (safe to delete)"
- One flag review on `duplicate_charge`
- One API key labelled **"E2E verification key (safe to revoke)"** — revoke it in the console.
  Its raw value was never written down anywhere, so it is already unusable.

### Not verified, and why

- **Webhooks** — needs a receiving endpoint. The config UI and the signing secret exist.
- **The sweep** — scheduled job; needs `pg_cron` and `CRON_SECRET` set (see `05_watcher_setup.md`).
- **Ingest** — needs a real provider connection with credentials.
- **Checkout** — needs the function redeployed with the CORS fix below.
- **`GET /v1/orders`** — new function, needs deploying.

---

## Three bugs found by running it

### 1. `orders.last_checked_at` did not exist — the serious one

Four Edge Functions write that column. No migration ever created it.

Every test suite passed anyway, and that is the interesting part: the SQL tests exercise the
schema with no functions, and the JS tests exercise the functions with no database. Nothing
crossed the seam. The gap only appears when a deployed function meets a real Postgres.

What it silently breaks until fixed:

- **ingest** — the order-merge UPDATE names the column, so every webhook touching an existing
  order fails and no supplier facts are ever merged.
- **the sweep** — the timeout UPDATE names it, so blown deadlines are never flagged. The watcher
  appears to run and does nothing.
- **`/v1/orders`** — every read 400s.

Fixed by `0012_last_checked_at.sql`. **Run this one.** It is a nullable column add: no table
rewrite, safe on a live database.

There is now a test that makes this class of bug impossible to reintroduce —
`tests/schema_vs_code.test.mjs` reads every column name out of the migrations, every column name
out of the Edge Functions, and compares the two sets. Verified it catches the original bug by
removing the fix and watching it fail.

### 2. `checkout` had no CORS headers

`checkout.html` calls it from the browser with an `Authorization` header and a JSON body, which
makes it a non-simple request: Chrome sends an `OPTIONS` preflight first and refuses to read the
response unless both the preflight and the real reply carry CORS headers. Mine carried none, so
checkout would have failed with a bare "Failed to fetch" and no status code. Redeploy `checkout`.

### 3. `API_BASE` in your live `config.js` was set to the anon key

Not a code bug — a copy-paste — but the failure mode was invisible: every Edge Function call
resolved as a *relative* path against relay-travel.ai and 404'd, with nothing in the UI to say
why. `setup.js` now repairs this itself: anything in `API_BASE` that is not an absolute `https://`
URL is ignored and rebuilt from `SUPABASE_URL`.

---

## What to run

```sql
-- Supabase → SQL Editor
-- paste supabase/migrations/0012_last_checked_at.sql, Run
```

```bash
supabase functions deploy checkout --use-api          # picks up the CORS fix
supabase functions deploy orders --no-verify-jwt --use-api   # new
```

Then re-upload `dist/` for the `setup.js` repair.

---

## The Claude plugin

`relay.plugin` — install it, and Claude can check bookings itself.

### Tools

| Tool | What it does |
|---|---|
| `relay_reconcile_order` | Submit the three views; get verdict, flags, resolution, severity |
| `relay_get_order` | Fetch one order Relay knows about, including lifecycle state |
| `relay_list_orders` | List tracked orders; filter by verdict, state, or flag code |
| `relay_explain_flag` | Explain a flag code — no network call |
| `relay_status` | Tells "no key" apart from "bad key" apart from "API unreachable" |

### Setup

```bash
export RELAY_API_KEY=sk_test_...
export RELAY_API_BASE=https://tbibbqofgtdhacotlqcf.supabase.co/functions/v1
```

`RELAY_API_BASE` is only needed until `api.relay-travel.ai` points at your project — the plugin
defaults to that hostname.

### Design decisions worth knowing

**Zero dependencies.** The MCP server speaks JSON-RPC directly rather than importing an SDK. It
is one file, it needs no `npm install`, and it will still start in two years.

**The skill teaches judgement, not just usage.** Two failure modes are called out explicitly:

- *An `open` order is not a cleared order.* Relay is still holding it against a deadline waiting
  for the supplier. Claude is told to say so rather than report success.
- *Never guess a field.* An absent field is never a mismatch, but a guessed one produces a false
  flag — and false positives are the fastest way to make a monitoring tool worthless.

**`relay_status` exists for one reason:** no key, a rejected key, and an unreachable API look
identical from the outside, and all three produce the same useless "it didn't work". It
distinguishes them so the answer is actionable.

### How it was tested

The server was spawned and driven over real stdio JSON-RPC, against a mock Relay API:

- `initialize`, `tools/list`, `tools/call`, `ping`, and an unsupported method returning `-32601`
- A notification (no id) correctly receives **no reply** — replying to one breaks strict clients
- All five tools called, with filters, against a live mock returning real shapes
- A missing key, a rejected key, and an unreachable API each produce a distinct, useful message
- A path-traversal `order_id` is URL-encoded rather than passed through

### Why `GET /v1/orders` had to be built

`relay_list_orders` and `relay_get_order` needed a read endpoint that authenticates with a Relay
API key. The console reads orders through PostgREST with the signed-in user's JWT and RLS — a
path useless to a server-side integration, which has a key and no browser session.

That function runs as `service_role` and therefore bypasses RLS entirely, so the workspace filter
in the query **is** the tenant boundary. It also scopes to the key's own mode: a `sk_test_` key
can never see live orders.

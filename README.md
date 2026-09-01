# Relay

The reliability layer for AI travel transactions. Reconciles what a customer
agreed to buy, what was actually charged, and what the supplier confirmed —
and flags every case where the three don't match.

`payment succeeded` does not mean the trip happened.

## What's in this repo

- `dist/` — the public website (relay-travel.ai): marketing pages, product and
  pricing, the customer console, and the public API reference in `docs.html`
- `plugin/` — the Claude plugin: an MCP server plus the
  `relay-order-integrity` skill that lets Claude check travel bookings against
  Relay
- Public planning and ops docs: the one-pager, go-live guide, data-protection
  notes, pages and billing, and the live-verification record

The reconciliation engine itself — the Supabase backend, Edge Functions,
database migrations, and provider adapters — is closed-source and
intentionally not part of this repository.

## Repo layout

```
dist/                 ← deploy this folder as the website (relay-travel.ai)
  index.html            marketing site
  product.html          what Relay is, the ten flags, what it deliberately isn't
  pricing.html          three tiers, rendered from plans.js
  checkout.html         plan summary → Stripe. Sign-in gated.
  api-access.html       self-serve sandbox key + live-key request form
  contact.html          contact form (?topic=partner|enterprise|security|support)
  account.html          profile page — name, workspace, plan, keys, sign out
  docs.html             public API reference
  login.html            sign up / sign in (email, Google, GitHub); honours ?next=
  app.html              customer console — orders, flag review, keys, webhooks,
                        billing, account. Needs config.js filled in.
  demo.html             self-contained console demo on sample data; no backend
                        needed.
  nav.js                shared nav + footer; swaps Sign in for the profile menu
  plans.js              ← THE ONE PLACE TO EDIT PRICING
  relay.css             shared design tokens
  site.css              marketing/secondary page styles
  config.example.js     ← copy to config.js and fill in your Supabase values
  favicon.png, logo.png, sitemap.xml, robots.txt

plugin/relay/           ← the Claude plugin (MCP server + skill)

02_relay_one_pager.md    positioning
03_go_live_guide.md      domain + hosting
06_data_protection.md    handling real traveller PII
08_github_and_google.md  GitHub + Google setup notes
09_pages_and_billing.md  the new pages, sign-in gating and Stripe
10_verification_and_plugin.md  what was verified live, and the Claude plugin
```

`dist/config.js` is gitignored on purpose — it holds your Supabase URL and
publishable key. Copy `config.example.js` to `config.js` and fill in your own
values when deploying; never put a `service_role` / secret key in it.

## The API

```
POST https://YOUR-PROJECT.supabase.co/functions/v1/reconcile
Authorization: Bearer sk_test_...
Content-Type: application/json

{
  "order_id": "ord_9F2k",
  "agreed":    { "amount": 2480, "currency": "USD", "route": "SFO-NRT",
                 "depart_date": "2026-09-14", "passenger": "Y DUAN", "refundable": true },
  "charged":   { "amount": 2480, "currency": "USD", "processor": "stripe",
                 "charge_id": "ch_1P...", "capture_count": 1 },
  "confirmed": { "supplier": "duffel", "status": "issued", "route": "SFO-NRT",
                 "depart_date": "2026-09-14", "passenger": "Y DUAN", "refundable": true }
}
```

Returns `verdict` (`cleared` | `flagged`), the specific `flags`, a recommended
`resolution`, and `severity`. Only `order_id`, `agreed` and `charged` are
required — a field the supplier didn't return is never treated as a mismatch,
and `confirmed` can be omitted entirely when the supplier hasn't responded yet,
in which case the order is held open and watched rather than rejected.

## What it detects

| Flag | Meaning |
|---|---|
| `unissued_after_charge` | Money taken, supplier order failed |
| `duplicate_charge` | More than one capture for one order |
| `partial_order` | Only part of the itinerary confirmed |
| `price_drift` | Charged amount ≠ agreed amount |
| `currency_mismatch` | Charged in a different currency than quoted |
| `refund_not_landed` | Refund initiated >5 days ago, never settled |
| `date_mismatch` | Confirmed departure date ≠ agreed |
| `route_mismatch` | Confirmed route ≠ agreed |
| `passenger_mismatch` | Confirmed passenger name ≠ agreed |
| `fare_rule_drift` | Sold refundable, confirmed non-refundable |

## Security notes

- API keys are stored as SHA-256 hashes with a short display prefix. The raw
  key is shown once at creation and is not recoverable — not by the customer,
  and not by anyone who gets into the database.
- Row Level Security is on for every table. A signed-in user can only read rows
  for workspaces they belong to, enforced in Postgres rather than in front-end
  code.
- The `service_role` key belongs only in the Edge Function environment
  (Supabase injects it). It must never appear in `config.js` or any file under
  `dist/`.
- Webhook deliveries carry `X-Relay-Signature`: SHA-256 of the workspace's
  signing secret concatenated with the raw request body. Receivers should
  verify it before trusting a payload.

## Claude plugin

See [`plugin/relay/README.md`](plugin/relay/README.md). Set `RELAY_API_KEY` to
a sandbox key from the Relay console and Claude can reconcile and inspect
orders directly.

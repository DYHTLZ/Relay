# Relay — post-booking integrity for flight & hotel orders

Gives Claude the ability to check whether a travel booking actually worked.

Every travel order exists in three places at once: what the traveller **agreed** to buy, what was
actually **charged**, and what the supplier **confirmed**. Nothing in a normal booking stack
compares them. This plugin lets Claude send all three to Relay and get back a verdict.

`payment succeeded` does not mean the trip happened.

## What it catches

| Flag | Meaning |
|---|---|
| `unissued_after_charge` | Money taken, supplier order failed |
| `duplicate_charge` | More than one capture for one order |
| `partial_order` | Only part of the itinerary confirmed |
| `price_drift` | Charged amount ≠ agreed amount |
| `currency_mismatch` | Charged in a different currency than quoted |
| `refund_not_landed` | Refund initiated over 5 days ago, never settled |
| `date_mismatch` | Confirmed departure date ≠ agreed |
| `route_mismatch` | Confirmed route ≠ agreed |
| `passenger_mismatch` | Confirmed passenger name ≠ agreed |
| `fare_rule_drift` | Sold refundable, confirmed non-refundable |

Every check is a deterministic comparison — no model, no probability score. A flag is a fact you
can reproduce by hand and show a customer.

## Setup

1. Create an account at [relay-travel.ai](https://relay-travel.ai), open the console, and click
   **Create sandbox key**. The raw key is shown once — Relay stores only a SHA-256 hash of it, so
   it cannot be recovered later, by you or by anyone who gets into the database.
2. Set the key in your environment:

   ```bash
   export RELAY_API_KEY=sk_test_...
   ```

3. Optionally point at a self-hosted deployment:

   ```bash
   export RELAY_API_BASE=https://YOUR-PROJECT.supabase.co/functions/v1
   ```

   The default is Relay's hosted API. `RELAY_API_BASE` should be the base that `/reconcile` and
   `/orders` hang off — no trailing slash needed.

Run `relay_status` to confirm the connection before anything else.

## Tools

| Tool | What it does |
|---|---|
| `relay_reconcile_order` | Submit the three views of an order; get a verdict, flags, resolution and severity |
| `relay_get_order` | Fetch one order Relay already knows about, including its lifecycle state |
| `relay_list_orders` | List tracked orders; filter by verdict, lifecycle state, or flag code |
| `relay_explain_flag` | Explain a flag code — meaning, severity, recommended fix. No network call |
| `relay_status` | Distinguish "no key" from "bad key" from "API unreachable" |

## The skill

`relay-order-integrity` teaches Claude *when* to reach for these — after any travel booking or
charge, when a payment succeeded but the supplier response was pending or absent, when a booking
was retried or timed out, and whenever someone reports a booking problem.

It also covers the two ways this tool gets misread:

- **An `open` order is not a cleared order.** Relay is still holding it against a deadline waiting
  for the supplier. Claude is told to say so rather than declare success.
- **Never guess a field.** An absent field is never a mismatch, but a *guessed* one produces a
  false flag — and false positives are the fastest way to make a monitoring tool worthless.

## Requirements

Node 18 or newer. The MCP server has **no dependencies** — nothing to install, and it still starts
in two years.

## Security

- Your API key is read from the environment. It is never logged, never returned in a tool result,
  and never written to disk.
- A `sk_test_` key can only ever see test-mode orders; a `sk_live_` key only live ones. Enforced
  server-side, not by the client.
- Relay stores traveller data to compare it. Read
  [what we store](https://relay-travel.ai/docs.html#privacy) before sending live orders.

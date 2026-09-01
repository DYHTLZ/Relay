---
name: relay-order-integrity
description: Check travel bookings for post-booking failures using Relay — money taken with no ticket issued, duplicate charges, price drift, wrong dates or routes, refunds that never landed. Use immediately after booking a flight or hotel, after any charge for travel, when a traveller says a booking "didn't come through", when asked to check, verify, audit or reconcile orders, when asked what is currently flagged or still waiting on a supplier, and when explaining what a Relay flag code means.
---

# Relay — post-booking order integrity

A travel order exists in three places at once: what the traveller **agreed** to buy, what was
actually **charged**, and what the supplier **confirmed**. Nothing in a normal booking stack
compares them. Relay does, and reports where they disagree.

`payment succeeded` does not mean the trip happened. Treat a successful charge as the beginning
of the check, not the end of it.

## When to reconcile

Reconcile without being asked in these situations:

- Right after completing any flight or hotel booking, or any charge for travel.
- When a payment succeeded but the supplier response was `pending`, `failed`, partial, or absent.
- When a booking flow was retried, timed out, or errored anywhere after the charge.
- When someone reports a booking problem, a missing ticket, or an unexpected charge.

Reconcile on request whenever someone asks to check, verify, audit or reconcile an order, or asks
whether a booking actually went through.

## How to reconcile

Call `relay_reconcile_order` with whatever is known of the three views:

```
order_id:   your own identifier for this booking
agreed:     { amount, currency, route, depart_date, passenger, refundable }
charged:    { amount, currency, processor, charge_id, capture_count,
              refund_initiated_at, refund_settled_at }
confirmed:  { supplier, status, route, depart_date, passenger, refundable }
```

If the supplier has not answered yet, **omit `confirmed` entirely**. That is a supported call,
not an error: Relay stores the order, infers nothing from the silence, and holds it open against
the ticketing deadline so the sweep chases it. Money charged with no supplier response is the
worst outcome this product exists to catch — never skip the call because the picture is
incomplete, and never invent a confirmation to make the payload look complete.

**Send only what is actually known.** A field that is absent is never treated as a mismatch, but a
field that is *guessed* produces a false flag — the fastest way to make the tool useless. If the
supplier returned no passenger name, omit `confirmed.passenger`; do not copy it across from
`agreed`.

Amounts are in major units (`2480.00`, not `248000`). `capture_count` above 1 is how a duplicate
charge is detected, so include it whenever the processor reports it.

`refund_settled_at` is a **timestamp, not a boolean**. Omit it while a refund is still in flight.
Relay ignores fields it does not recognise, so sending something like `refund_settled: true` does
not tell it the refund landed — the order keeps counting down and gets flagged
`refund_not_landed` after five days, on money the customer already has.

## Reading the result

The response carries `verdict` (`cleared` or `flagged`), the specific `flags`, a recommended
`resolution`, `severity`, and `state`.

- **`cleared`** — the three views agree. Say so briefly and move on. Do not dress it up.
- **`flagged`, severity `critical`** — money is at risk or a traveller will be stranded. Lead with
  it. State the flag in plain language, then the recommended resolution. Do not bury it under
  what went right.
- **`state: "open"`** — Relay has not finished judging. The supplier has not confirmed yet and
  Relay is holding the order against a deadline (20 minutes for ticketing, five days for a
  refund). This is *not* an all-clear. Say the order is still being watched, and check back with
  `relay_get_order` rather than declaring success.

Never soften a critical flag, and never present an open order as a completed one.

## Acting on flags

Relay detects and recommends; it does not move money or cancel bookings. Carry out the
recommended resolution through whatever booking or payment tools are available, and if none are,
state clearly what a human needs to do.

For duplicate charges and unissued tickets, the money side is urgent — a traveller has paid for
something they did not receive. For `date_mismatch` and `route_mismatch`, the *trip* is urgent:
someone is about to travel on the wrong day or to the wrong place, and that stops being fixable
close to departure.

`relay_explain_flag` gives the meaning, severity and recommended resolution of any flag code
without a network call. Use it when explaining a verdict rather than guessing at what a code means.

## Reviewing what's outstanding

- `relay_list_orders` with `verdict: "flagged"` — what is broken right now.
- `relay_list_orders` with `state: "open"` — what Relay is still waiting on.
- `relay_list_orders` with `flag: "<code>"` — every order carrying one specific failure.
- `relay_get_order` — the full stored record for one order.

## When a tool fails

Run `relay_status` first. It separates the three causes that look identical from the outside: no
API key configured, a key that was rejected, and an unreachable API. Report which one it is
instead of retrying.

A missing key is a setup problem, not a transient one — the person needs to create a key at
relay-travel.ai → console → API Keys and put it in `RELAY_API_KEY`. Keys are shown once at
creation and stored only as a hash, so a lost key cannot be recovered; a new one must be made.

## The ten flags

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

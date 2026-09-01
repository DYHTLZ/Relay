# Relay
### The reliability layer for AI travel transactions

## One sentence

Relay makes sure every travel order that gets paid for actually delivers what was promised — and automatically fixes it when it doesn't.

## The problem

A single AI-agent travel booking looks like one transaction but actually crosses several independent systems with no shared definition of "success":

AI Agent → Payment platform → Flight API → Airline → Hotel API → Hotel system

"Payment succeeded" does not mean the ticket was issued, the hotel was confirmed, the price matches what the user agreed to, the fare rules didn't quietly change, or the whole trip actually completed. Today these failures get caught — if at all — by a human digging through payment logs, supplier order records, and email threads with airlines and hotels, then manually filing for cancellation, refund, or rebooking. That model survives at the volume and pace of a human-staffed OTA. It does not survive AI agents booking travel autonomously, where the same failure mode repeats at machine speed and machine scale.

Common failure patterns Relay is built to catch:

- Charge succeeded, ticket never issued
- Flight booked, hotel failed (or vice versa) — partial order success
- Refundable fare booked as non-refundable, or other fare-rule drift
- Price changed between what the user agreed to and what was charged
- Duplicate charge from a retried API call after a timeout
- Wrong date, airport, or passenger name on the confirmed booking
- Refund marked "processed" but funds never actually arrive

## What Relay does (v1)

Customers — AI travel companies, small OTAs, and travel-tech teams booking through Duffel, Amadeus, Hotelbeds, and similar APIs — send Relay three things per order:

1. What the user agreed to purchase
2. What was actually charged
3. What the supplier ultimately confirmed

Relay reconciles the three and flags: failed ticketing, duplicate charges, price mismatches, date/name/airport mismatches, fare-rule drift, partial-order failures, and refunds that were promised but never landed.

**v1 does not move money.** It detects, explains, and generates a ready-to-work support ticket with a recommended resolution (refund / cancel / retry / re-book / escalate to human). Automated remediation is a deliberate v2, once detection accuracy is proven.

## Why not just use what exists

| Category | What they solve | What Relay solves |
|---|---|---|
| AI travel agents (ChatGPT, Mindtrip, etc.) | Recommending and planning trips | Doesn't plan anything — makes sure the order that gets placed completes correctly |
| Pre-booking verifiers (e.g. MustSeen) | Checking itinerary/inventory validity *before* booking | Checking money, order, and ticket consistency *after* booking |
| Post-booking service tools (e.g. Acai, GDS42) | Helping agencies handle disruptions, changes, and support tickets | Continuously monitoring every transaction to catch and surface failures before a human has to notice |
| Payment authorization (Visa/Amex Agentic Commerce) | Confirming the agent is authorized to spend the user's money | Confirming the money actually bought what the user authorized |
| Payment processors (Stripe/Adyen) | Telling the merchant payment succeeded or failed | Reconciling that payment outcome against what the airline/hotel actually delivered |
| Traditional travel reconciliation software | Month-end billing/ADM/finance reconciliation | Catching the problem within seconds to minutes of it happening |

The closest adjacent plays are pre-booking verification and post-booking service. Relay's job is to own the narrow, unglamorous, high-stakes middle: **order integrity across payment and supplier systems** — and resist drifting into being "another travel support bot."

## Validation plan (4 weeks, compressed where possible)

| Week | Goal | Pass bar |
|---|---|---|
| 1 | Talk to 15+ AI travel / OTA / travel-tech companies about real incident data | 5+ report weekly+ occurrence; 3+ share anonymized failed orders |
| 2 | Manually run "Relay by hand" on 1–2 companies' anomalous orders | Prove you catch issues they didn't already know about |
| 3 | Ship a minimal product for one stack (e.g. Stripe + Duffel): ingest events, show order status, flag the top 3 anomaly types | Working demo on real or realistic data |
| 4 | Convert to a paid pilot | 3 companies onboard, 10k+ historical orders reviewed, 3+ recurring anomaly types confirmed, ≥1 paying customer |

**Kill criteria:** if prospects won't share data, incident rates are very low, or every case genuinely requires a phone call a human was going to make anyway — stop here rather than pushing forward.

## Pilot pricing options

- Per order monitored (usage-based, low friction to start)
- Per order successfully recovered (aligned incentive, easiest pilot pitch)
- Percentage of amount recovered (highest alignment, works once recovery is automated in v2)

---
*Relay — payment succeeded doesn't mean the trip did. We make sure it does, and clean up automatically when it doesn't.*

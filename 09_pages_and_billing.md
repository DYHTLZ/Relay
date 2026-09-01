# Relay — the new pages, sign-in and billing

What changed, and the two things you have to run before any of it works.

---

## The bug you hit

Every button on the site was a `mailto:` link. Clicking "Request API access" tried to
open your mail client with a half-written email in it — on a phone with no mail app
configured, or a browser with no default handler, that's the "weird link" you saw.
Nothing on the site actually went anywhere.

There are now zero `mailto:` links in `dist/`. Every button leads to a page.

| Button | Used to do | Now goes to |
|---|---|---|
| Request API access (nav + hero) | open email | `api-access.html` |
| We'd love to have you join us | open email | `contact.html?topic=partner` |
| Ask a question | open email | `contact.html` |
| Request a live key (console) | open email | `api-access.html` |
| Set up billing with us (console) | open email | `pricing.html` |
| Talk to us first (login) | open email | `contact.html` |

---

## New pages

- **`product.html`** — what Relay is, why the failure happens, the ten flags, who it's for,
  and an explicit "what Relay is not" so a prospect doesn't imagine it books or moves money.
- **`pricing.html`** — three tiers. Paid plans require sign-in before checkout.
- **`checkout.html`** — order summary, then Stripe. Sign-in gated.
- **`api-access.html`** — sandbox is self-serve; a form requests a live key.
- **`contact.html`** — a real form, with topic presets (`?topic=partner`, `?topic=enterprise`, `?topic=security`).
- **`account.html`** — the profile page. Display name, company, sign-in method, workspace,
  plan, active key count, password reset, sign out.

Plus `nav.js` (the shared nav and footer), `site.css`, and `plans.js`.

---

## Sign-in, top right

Every page carries the same nav. Signed out it shows **Sign in** and **Request API access**.
Signed in, both collapse into an avatar with your initial — click it for Profile & settings,
Console, Plan & billing, and Sign out.

Gated pages (`account.html`, `checkout.html`) bounce you to
`login.html?next=<where you were>` and bring you straight back afterwards. `next` only
accepts a same-site page name — an absolute URL is ignored and you land on the console
instead, so the login page can't be used to launder a phishing redirect.

**Nobody can pay without an account.** Choosing Growth or Scale while signed out sends you
to sign in first, then to checkout with the plan intact. A subscription attaches to a
workspace, and a workspace only exists behind sign-in.

---

## Editing the prices

One file: **`dist/plans.js`**. Change the numbers, redeploy, done — `pricing.html`,
`checkout.html` and `account.html` all read from it, so they can't disagree with each other.

The current numbers are placeholders I picked to look plausible next to comparable
infrastructure pricing. Nothing is anchored to them yet:

| Plan | Price | Included | Overage |
|---|---|---|---|
| Sandbox | $0 | 500 / month | — |
| Growth | $249 / month | 10,000 / month | $0.02 per order |
| Scale | $1,200 / month | 100,000 / month | $0.012 per order |

The Stripe price ids in that file are intentionally blank. **The prices that actually get
charged live in the Edge Function's environment, not in `plans.js`** — otherwise a customer
could post `{"plan":"scale","price":1}` from their browser console and buy the top tier for
a dollar.

---

## Two things to run

### 1. Migration `0011_site_forms_and_billing.sql`

SQL Editor → paste → Run. Creates `contact_messages`, `access_requests`, `billing_intents`
and `subscriptions`.

The RLS shape here is worth understanding, because the obvious version is a data breach.
A contact form has to accept writes from strangers, so `anon` gets INSERT. The lazy way to
write that policy also grants SELECT — which would let any visitor read every enquiry every
other prospect ever sent, through a marketing page, with no error and no sign anything was
wrong. So there is **no** SELECT policy on either form table. You read submissions in the
Supabase dashboard (Table Editor), which runs as `service_role` and bypasses RLS.

Subscriptions are read-only from the browser for the same class of reason: if a customer
could write their own subscription row, they'd upgrade themselves to Scale for free with one
line of JavaScript. Only the checkout function and the Stripe webhook write there.

Verify it with `tests/forms_billing.test.sql` — paste it in and run. Eight checks; all
eight pass on a clean database here, including a simulated self-upgrade attempt that is
correctly refused by Postgres.

### 2. Deploy the `checkout` function

```bash
supabase functions deploy checkout --use-api
```

Leave **Verify JWT ON** for this one. That's the opposite of `reconcile` and `ingest`:
those authenticate with Relay API keys, this one is only ever called by a signed-in human.

---

## Turning payments on later

Until `STRIPE_SECRET_KEY` exists, the function returns `503 payments_not_enabled` and the
checkout page says so plainly, then offers to **reserve** the plan — which writes a
`billing_intents` row. You get a real queue of people who wanted to pay, instead of a card
form that silently goes nowhere.

When you're ready:

1. Create the two products in Stripe (Growth, Scale), monthly recurring prices.
2. `supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_GROWTH=price_... STRIPE_PRICE_SCALE=price_...`
3. That's it — the checkout page starts sending people to Stripe on the next click.

One piece is still missing by design: the Stripe **webhook** that flips a subscription from
`incomplete` to `active` when payment succeeds. The table, the status column and the trigger
that promotes `workspaces.plan` are all in place and tested — a subscription set to `active`
promotes the workspace to that plan, and setting it to `canceled` drops it back to sandbox.
Only the receiver is left, and it should be written against your real Stripe account so the
signature verification is tested against real events rather than my guesses about them.

---

## Reading what comes in

Supabase dashboard → **Table Editor**:

- `contact_messages` — sort by `created_at`, set `handled_at` when you've replied.
- `access_requests` — `status` moves `new → contacted → approved`.
- `billing_intents` — people who chose a paid plan before billing was live. Call these first.

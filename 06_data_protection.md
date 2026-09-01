# Relay — Protecting Travellers' Data

You asked how to *secure* users' travel data. This is the part where the honest answer includes some things you have to decide rather than things I can build.

The short version: you're about to hold passenger names, travel dates, routes and payment references belonging to people who have never heard of you. In the EU and UK that's personal data under GDPR, and your customer — the OTA or AI travel company — is the **controller** while Relay is the **processor**. That distinction has legal consequences, and it's also the frame every security review you face will use.

---

## What's already handled

| | Status |
|---|---|
| Encryption in transit | HTTPS everywhere, enforced by the host |
| Encryption at rest | Supabase encrypts Postgres storage by default |
| Tenant isolation | Row Level Security, enforced in the database — not in front-end code |
| API key storage | SHA-256 hashes only; raw keys unrecoverable even from a full DB dump |
| Card data | Never touched. Relay reads `charge_id`, never a card number |
| Webhook authenticity | Signed with a per-workspace secret |

That last one matters more than it sounds: **because Relay never handles card numbers, PCI-DSS scope stays with your customer's payment processor and never lands on you.** Keep it that way. The moment you accept a PAN in a request body, you've inherited an audit you don't want. The schema has no column for one, and it should stay that way.

---

## What you need to decide

### 1. Data minimisation — the highest-leverage thing on this list

Relay compares fields. It does not need to *keep* them.

Right now `orders` stores the full `agreed` / `charged` / `confirmed` JSON verbatim, which is great for disputing a verdict and bad for your exposure surface. For passenger names specifically, comparison only needs to know **whether two values match**, not what they are:

```sql
-- Instead of storing "YUKI DUAN", store a comparison token:
-- encode(digest(upper(trim(passenger)) || workspace_salt, 'sha256'), 'hex')
```

Hash both sides on the way in, compare the hashes, keep neither name. You lose the ability to show "agreed *Y DUAN*, confirmed *YI DUAN*" in a flag detail — which is a real loss for the ops person fixing it, so it's a genuine tradeoff, not a free win. A reasonable middle path: store the name but purge it on a short clock (below), keeping only the flag.

My recommendation: don't hash names yet, but **do** set retention now, and revisit hashing the first time a customer's security team asks — because they will, and having thought about it is worth as much as having done it.

### 2. Retention — set it before there's data, not after

Nothing in Relay's job requires keeping an order forever. Add this and let it run:

```sql
-- Purge the raw payloads after 90 days, keep the verdict for your metrics.
create or replace function public.purge_old_payloads()
returns void language sql security definer set search_path = public as $$
  update public.orders
     set agreed    = jsonb_build_object('redacted', true),
         charged   = jsonb_build_object('redacted', true),
         confirmed = jsonb_build_object('redacted', true)
   where created_at < now() - interval '90 days'
     and not (agreed ? 'redacted');
$$;

select cron.schedule('relay-purge', '0 3 * * *', $$ select public.purge_old_payloads(); $$);
```

You keep flags, verdicts and timestamps (so your accuracy stats and case studies survive) and drop the personal data. 90 days is a defensible default: long enough to investigate a dispute, short enough to be a real limit. Let a customer shorten it if they ask — some will.

### 3. Deletion on request

GDPR gives travellers a right to erasure, exercised through your customer, not through you. You need to be able to answer "delete everything for booking X" within days, not "we'd have to look into that." You already can:

```sql
delete from orders where workspace_id = $1 and external_id = $2;
```

Write that into your DPA as a documented capability. Also note: workspace deletion already cascades to orders, keys and webhooks via `on delete cascade`, so offboarding a customer cleanly is one statement.

### 4. Audit trail — who looked at what

Currently there's no record of which human read which order. For a pilot with one design partner, that's a defensible gap. Before a second customer, add it: an `access_log` table written on order reads, or enable Supabase's own audit logging on a paid plan. Any enterprise security questionnaire asks this, and "we don't log access" ends the conversation faster than "we log it and retain 90 days."

### 5. Where the data physically lives

Pick your Supabase region deliberately. If you expect EU customers, an EU region avoids an entire conversation about international transfer mechanisms. If your first design partner is US-based, `us-east-1` is fine. **This is not changeable after the project is created** — you'd migrate — so decide before Step 1 of the backend setup, not after.

### 6. The document you'll be asked for

Your first real customer's legal team will ask for a **Data Processing Agreement**. It needs to say: what you process, why, for how long, who your sub-processors are (Supabase, and your host — name them), how you handle breaches, and what happens on termination. Get a template reviewed by an actual lawyer rather than assembling one from blog posts — this is a real contract with real liability, and it's cheap relative to the risk. I can draft the technical sections for the lawyer to work from, which cuts the cost meaningfully.

To be clear: I'm not a lawyer and none of the above is legal advice. It's the engineering shape of what the legal requirements will ask of you.

---

## Practical hygiene, in priority order

1. **Turn on MFA for your Supabase account today.** Your account is the master key to every customer's data. This takes two minutes and is the highest-value security action available to you right now.
2. **Never let a secret key into a file under `dist/`.** Anything you deploy is publicly readable. The `service_role` / `sb_secret_` key belongs only in Edge Function environment variables.
3. **Rotate the sandbox keys you've used during testing** before real customer data exists.
4. **Enable Supabase's daily backups** when you move to the paid tier — the free tier has none, so today a mistaken `delete` is unrecoverable. Worth knowing before you're storing something you can't lose.
5. **Set up point-in-time recovery** before your first paying customer.
6. **Don't put real customer order data in the batch reconciler on your laptop** without deleting it afterwards. The `--anonymize` flag masks names in the generated report, but the source CSV a prospect emails you is raw personal data sitting in your Downloads folder. Treat it accordingly: it's the single most likely place you leak something, and it has nothing to do with your code.

---

## What to say when a prospect asks "is our data safe with you?"

Something like:

> Every customer's data is isolated at the database level, not the application level — the isolation is enforced by Postgres row-level security, so a bug in our UI can't expose your orders to anyone else. Traffic is encrypted in transit and at rest. We never receive or store card numbers, only your processor's charge references, so we stay outside your PCI scope. Raw order payloads are purged after 90 days; verdicts are retained without personal data. We can delete any specific booking or your entire workspace on request. We're a processor, you're the controller, and we'll sign a DPA to that effect.

Every sentence there is true of what's now built, except the 90-day purge — which becomes true the moment you run the SQL in section 2. Do that before your first real order arrives, so it never becomes something you have to walk back.

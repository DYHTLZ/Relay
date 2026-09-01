# Relay — Go-Live Guide for relay-travel.ai

This gets the site onto **relay-travel.ai** today. No coding required after this point — the files are already complete, self-contained pages. There are two: `index.html` (the public marketing site) and `app.html` (the product console — API keys, webhooks, billing, account). Keep them in the same folder; the site's "Console" link in the nav points to `app.html` as a relative link, so it only resolves once both files are deployed together. Both files now have `relay-travel.ai` baked into their canonical/OG tags, and `app.html` is marked `noindex` so Google doesn't crawl a dashboard full of fake sandbox data.

## Step 1 — Deploy the site (10 min, free, no CLI)

**You do not need to rent a server.** These are static files served from a CDN, and the database/API live on Supabase. There's no machine for you to maintain, patch, or pay for while idle.

**Recommended — Cloudflare Pages:**

1. Sign in at **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. Drag in the whole `dist/` folder (not the individual files — the folder keeps the relative links between pages working)
3. Deploy. You get a live `*.pages.dev` URL immediately, with HTTPS already set up.

Cloudflare Pages' free plan has **unlimited bandwidth**, which is why it's the first choice here.

**Alternative — Netlify Drop** (app.netlify.com/drop, drag the `dist/` folder on): equally easy, but be aware its free plan moved to a credit-based model, and it's a hard cap — if you exhaust the monthly credits your site *pauses* until the next cycle. Fine for testing, riskier once you're sending the link to prospects.

Either way, upload the **whole `dist/` folder** and nothing else. Do not upload `supabase/` or `tests/` — anything you deploy is publicly readable, and those are internals.

## Step 2 — Point relay-travel.ai at the site (5–30 min, mostly DNS propagation wait)

**If you host on Cloudflare Pages (recommended):** in the Pages project click "Custom domains" → add `relay-travel.ai`. If the domain is also on Cloudflare, it connects in one click with no manual records. If it's registered elsewhere, Cloudflare gives you a CNAME target to add at your registrar — or you can move the domain's nameservers to Cloudflare (free) and skip manual DNS entirely.

**If you used Netlify:**
1. In your Netlify site dashboard: Domain settings → Add a domain → enter `relay-travel.ai`
2. Netlify shows you either an A record + CNAME, or its own nameservers — pick "use Netlify DNS" if offered, it's simplest
3. Go to wherever you registered `relay-travel.ai`, find its DNS settings, and either point the nameservers at the ones Netlify gave you, or add the A/CNAME records Netlify specified
4. Wait 10–60 minutes for DNS to propagate (sometimes up to 24 hours, rarely, especially common on `.ai` domains — the registry is small)
5. Netlify auto-provisions a free HTTPS certificate once the domain resolves

Also add `www.relay-travel.ai` as a second domain in the same host and let it redirect to the root — cheap insurance since some people will type the `www.` out of habit.

## Step 3 — Sanity check before sharing the link

- Open `relay-travel.ai` in an incognito window (avoids cached old content)
- Click every nav link, including "Console" — it should land on `relay-travel.ai/app.html`
- Click "We'd love to have you join us" and "Set up billing with us" — they should open an email draft to your address
- Check it on your phone — the layout is responsive but always worth eyeballing once live
- Run it through Google's PageSpeed Insights (pagespeed.web.dev) once live, mostly to confirm nothing is broken — a single static HTML file like this should score well by default

## What this doesn't cover yet

Both pages are static — there's no server behind them. `app.html`'s sandbox API key, webhook field, and account form are real, working front-end interactions (they generate and save data in your own browser via localStorage), but nothing is sent anywhere, and nothing is shared between visitors. Every "request access" / "set up billing" button opens an email draft rather than submitting a form — deliberately, since there's no real signup database or payment processor behind this yet, and a form that looked functional but wasn't would be worse than an honest email link.

When you're ready to make this real, the next build is a backend: real user accounts (sign-up/login), a database to store API keys and orders per customer instead of in one browser's localStorage, and — only once there's an actual reconciliation engine running — a real Stripe integration for billing. That's a genuinely different project from a static site (a server, a database, real auth), not something that can live in these two HTML files. Say the word when you're ready to scope that and we can start there.

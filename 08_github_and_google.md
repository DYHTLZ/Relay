# Relay — Connecting GitHub and Google

Two things worth doing now that the site is live. GitHub gives you version history and turns deployment into `git push`. Google gets `relay-travel.ai` into search results and tells you what people search to find it.

*(If you meant "Sign in with Google/GitHub" for the login page — that's Step 2b in `04_backend_setup.md`, a different thing.)*

---

## Part 1 — GitHub

### Why bother, when drag-and-drop works

Right now every change means dragging a folder onto a hosting dashboard. Three problems with that: no history (a bad edit is unrecoverable), no record of *why* anything changed, and you can only deploy from the machine that has the folder. Ten minutes here removes all three, and after it, publishing is one command.

### Set it up

You need Git installed (`git --version`; if missing, `brew install git` on Mac or download from git-scm.com).

**1. Make the repo local.** From your project folder:

```bash
cd path/to/relay-project

git init
git branch -M main
```

**2. Add a `.gitignore` first — before the first commit.** This matters: once a secret is committed, removing it later doesn't remove it from history.

```bash
cat > .gitignore <<'EOF'
# never commit real credentials
dist/config.js
.env
.env.*
*.pem
*.key

# local noise
node_modules/
.DS_Store
*.log
findings.html
findings.csv
supabase/functions/*/bundled.ts
EOF
```

**Note `dist/config.js` is ignored.** It holds your Supabase URL and publishable key. Those are technically safe to expose — but keeping deploy config out of the repo is the right habit, and you do not want the next person on the project committing a secret key into the same file. Commit a template instead:

```bash
cp dist/config.js dist/config.example.js
# then edit config.example.js and blank out the real values
```

**3. First commit:**

```bash
git add .
git status          # ← actually read this. Confirm config.js is NOT listed.
git commit -m "Relay: site, console, reconciliation engine, migrations"
```

**4. Create the GitHub repo.** github.com → New repository → name it `relay` → **Private** → do *not* add a README (you have one). Then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/relay.git
git push -u origin main
```

### Deploy on push

This is the part that pays for the setup. In **Cloudflare Pages** → your project → Settings → **Builds & deployments** → Connect to Git → pick the repo. Then:

- Production branch: `main`
- Build command: *leave empty* (nothing to build — these are static files)
- Build output directory: `dist`

Netlify is the same shape: Site configuration → Build & deploy → Link repository, publish directory `dist`, no build command.

From now on:

```bash
git add .
git commit -m "what changed"
git push
```

...and the site updates itself in about a minute.

**One thing to set up on the host after connecting:** because `config.js` is gitignored, it won't be in the repo, and your deployed site will show the "not connected to a database" banner. Two options — either un-ignore it (the values in it are public anyway), or add a build step that writes it from environment variables. For a one-person project, un-ignoring it is the pragmatic call:

```bash
git rm --cached dist/config.js    # keeps the local file
# remove the dist/config.js line from .gitignore
git add dist/config.js .gitignore
git commit -m "Track deploy config (publishable values only)"
```

Just keep the rule intact: **the `service_role` / `sb_secret_` key never goes in any file in the repo.**

### Writing commit messages you'll thank yourself for

Say what changed and why, not what file you touched:

```
Fix cross-tenant leak in reporting views

Views were SECURITY DEFINER by default, so they bypassed RLS on the
underlying tables. Verified an authenticated user could read another
workspace's health stats. security_invoker = on closes it.
```

In six months, "update sql" tells you nothing. The above tells you everything.

---

## Part 2 — Google

### Search Console (do this one)

This is how you find out whether Google can see your site at all, and what people search before they land on it.

**1.** Go to **search.google.com/search-console** → Add property → choose **Domain** (covers `relay-travel.ai`, `www.`, and every path).

**2.** Google gives you a TXT record. Add it at your registrar's DNS settings:

| | |
|---|---|
| Type | `TXT` |
| Name | `@` (or blank, or `relay-travel.ai` — registrars differ) |
| Value | `google-site-verification=...` (the string Google gave you) |

**3.** Wait, then click Verify. DNS usually propagates in minutes; `.ai` domains can take longer, so if it fails, wait an hour and retry rather than assuming you did it wrong.

**4. Submit a sitemap.** You don't have one — for a two-page site you barely need it, but it makes indexing deterministic. Add `dist/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://relay-travel.ai/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

Only the marketing page. `app.html`, `login.html` and `demo.html` are already marked `noindex` — a login screen and a demo console have no business in search results.

Also add `dist/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /app.html
Disallow: /login.html

Sitemap: https://relay-travel.ai/sitemap.xml
```

Then in Search Console → Sitemaps → submit `sitemap.xml`.

**5. Request indexing** for `https://relay-travel.ai/` via the URL Inspection tool. Without it you may wait weeks; with it, usually days.

### Analytics — and a reason to hesitate

The obvious move is Google Analytics. Worth thinking about first: GA adds third-party tracking to a site whose entire pitch is careful handling of other people's data. Some of your prospects' security teams will notice. And under GDPR, GA needs a cookie banner to be done properly, which is friction on a page whose job is to get someone to email you.

For your actual question — *"is anyone visiting, and where from?"* — a privacy-friendly analytics tool answers it with no cookies, no banner, and a script a fraction of the size. **Cloudflare Web Analytics is free** and, if you're hosting there, is a toggle rather than an integration. Plausible and Fathom are paid alternatives (~$9/mo).

If you do want GA4: analytics.google.com → create property → get the `G-XXXXXXX` tag → paste the snippet before `</head>` in `dist/index.html`. But add a cookie banner before you send the link to any EU prospect.

My recommendation: Search Console yes, definitely. Analytics — Cloudflare's, and skip GA.

### Google Business Profile

Skip it. It's for businesses with a physical location or local customers. You're B2B infrastructure selling to travel-tech companies; it does nothing for you.

---

## Order to do these in

1. **GitHub repo + gitignore + first commit** — 10 min, and it means nothing you've built can be lost.
2. **Connect the repo to your host** — 5 min, and deployment stops being a chore.
3. **Search Console + sitemap** — 15 min, then leave it alone for a few weeks.
4. **Analytics** — whenever. Nobody is visiting yet; there's nothing to measure until you start the outreach in `01_target_list_and_outreach.md`.

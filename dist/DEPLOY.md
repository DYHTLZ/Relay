# Relay site — deploy notes

Michael, Oct 6 2026. Everything here is the `/web` folder from the 4-week plan.

## 1. Run the migration first

`supabase/migrations/0016_waitlist.sql` creates the `waitlist` table. The form
will 404 until it exists.

```
supabase db push
# or paste the file into the SQL editor
```

It applies from an empty schema and passes 11/11 assertions against Postgres 16
(`tests/waitlist.test.sql`). What it guarantees:

- `anon` can **INSERT only**. There is deliberately no SELECT policy, so the
  publishable key in `config.js` cannot read the list back — verified, not assumed.
- `anon` cannot UPDATE or DELETE.
- The `WITH CHECK` is real validation (email shape, length caps, group size 2–60,
  `handled_at` must be null on insert), not `true`.
- `lower(email)` is unique, so a repeat signup returns 409 and the page treats it
  as success.

Read the list with the service role:

```sql
select created_at, email, name, chat_app, trip_window, group_size, note
from public.waitlist order by created_at desc;
```

`chat_app` is the column Esme needs for the Oct 8 channel decision.

## 2. Check config.js

```js
SUPABASE_URL: "https://tbibbqofgtdhacotlqcf.supabase.co"
SUPABASE_ANON_KEY: "sb_publishable_..."
```

Both carried over from the old site. If the project changed, update them — the
page detects a placeholder key and tells the visitor to email instead of failing
silently.

## 3. Upload `dist/`

Static files, no build step. 14 files, ~160 KB.

### api.html — the old site, kept

The original post-booking integrity site is restored at `api.html`, recovered
intact from the Aug 30 artifact. Nothing about it changed except:

- a slim strip above the nav with two buttons — **Group travel site** to
  `index.html`, **Join the waitlist** to `index.html#waitlist`;
- the same two links again under the pilot CTA, for anyone who read to the end;
- the dead `Console` nav link to `app.html` removed (that page no longer exists);
- a real `<title>` and description, so the two pages don't compete as "Relay".

Its own mailto CTAs are untouched — "Request API access" and the design-partner
buttons still email yduan2435@gmail.com.

`index.html` links back to it from the footer as **For developers**.

It is deliberately **not** in `sitemap.xml`. It is reachable and linked, but
keeping it out of the sitemap stops it competing with the homepage for the
"Relay" query, which matters while the two pages describe different products.

## What was verified

| Check | Result |
|---|---|
| WCAG AA contrast, 3 pages × light and dark | 0 failures |
| Horizontal overflow at 1280px and 390px | none |
| Internal links and in-page anchors | 30 checked, 0 broken |
| Waitlist form (happy path, duplicate, bad email, 403, 500, offline, bad config) | 41/41 |
| Migration against Postgres 16 | 11/11 |

Two bugs the tests caught that reading would not have:

- `.panel .card p` kept the light-theme text colour, so the four cards in the
  dark section were rendering at 2.35:1. Invisible to anyone who didn't measure.
- The placeholder-detection regex in `waitlist.js` had an empty first
  alternative (`/^(|YOUR_|...)/`), which matches every string. The form would
  have refused every submission on the live site and told nobody.

## Known gaps

- **Fonts could not be loaded in the test environment** (Google Fonts is blocked
  by the sandbox proxy), so the screenshots show fallback faces. Outfit and
  Figtree will load on the real site — worth one look after upload.
- The old site's pages (docs, pricing, checkout, account, app, demo, api-access,
  security) are **not** in this build. They described the post-booking integrity
  API. If any are still live, delete them or they'll contradict the new site.
- `og-image.png` is generated with a fallback typeface, not Outfit. Fine for now;
  worth regenerating once the brand font is on hand.

## Copy that is a placeholder, not a decision

- **$39 per trip** on the roadmap section. The deck says `[$29–49]`. Change the
  number in `index.html` (search `$39`) when you pick one.
- The team line names Justin, Michael, Allison and Esme. Add surnames or drop it
  if you'd rather not list the team pre-launch.

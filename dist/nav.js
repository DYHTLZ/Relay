// Relay — shared page chrome and auth state.
//
// One nav for every page. The right-hand side is the only part that changes:
// signed out it offers Sign in + Request API access, signed in it becomes an
// avatar menu with the profile page, the console and sign out.
//
// Load order on a page:  config.js → setup.js → supabase UMD → nav.js
//
// The nav must never depend on the backend being configured. If config.js is
// still a template, or the Supabase library is blocked, the nav renders in its
// signed-out form rather than disappearing.

(function () {
  var LINKS = [
    { id: "product", href: "product.html", label: "Product" },
    { id: "pricing", href: "pricing.html", label: "Pricing" },
    { id: "docs",    href: "docs.html",    label: "Docs" },
    { id: "demo",    href: "demo.html",    label: "Live demo" },
    { id: "contact", href: "contact.html", label: "Contact" },
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var SUPABASE_CDN =
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js";

  /**
   * Is anyone signed in on this browser?
   *
   * Supabase parks its session under a localStorage key named
   * `sb-<project-ref>-auth-token`. Checking for it costs nothing and answers
   * the only question the marketing pages actually have.
   *
   * This matters because the auth library is ~120KB that every visitor to the
   * homepage was downloading and parsing in order to be told, almost always,
   * that they are not signed in. Now it loads only for people who are.
   */
  function hasStoredSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
      }
    } catch (e) { /* private window, blocked storage */ }
    return false;
  }

  /** Load the auth library on demand. Resolves to true if it is available. */
  function ensureSupabase() {
    if (window.supabase) return Promise.resolve(true);
    if (window.__relaySbLoading) return window.__relaySbLoading;

    window.__relaySbLoading = new Promise(function (resolve) {
      var el = document.createElement("script");
      el.src = SUPABASE_CDN;
      el.async = true;
      el.onload = function () { resolve(Boolean(window.supabase)); };
      el.onerror = function () { resolve(false); };   // ad blocker, offline
      document.head.appendChild(el);
    });
    return window.__relaySbLoading;
  }

  /** A Supabase client, or null if the site isn't configured or the lib is absent. */
  function client() {
    if (window.__relaySb !== undefined && window.__relaySb !== null) return window.__relaySb;
    var ok = window.RELAY_SETUP && window.RELAY_SETUP.isConfigured() && window.supabase;
    var cfg = window.RELAY_CONFIG || {};
    window.__relaySb = ok
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;
    return window.__relaySb;
  }

  function navHTML(active) {
    var links = LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (l.id === active ? ' class="here"' : "") + ">" + l.label + "</a>";
    }).join("");

    // Below 880px the horizontal links are hidden by CSS. Without this button
    // a phone visitor could reach nothing but sign-in — the entire site,
    // including the demo and the docs, was unreachable on mobile.
    return '<nav class="top"><div class="wrap">' +
      '<a class="wordmark" href="index.html"><span class="baton"><img src="logo.png" alt=""></span>Relay</a>' +
      '<div class="navlinks">' + links + "</div>" +
      '<div class="nav-right" id="nav-right">' +
        '<a class="nav-signin" href="login.html">Sign in</a>' +
        '<a class="nav-cta" href="login.html?mode=signup&next=app.html">Start free</a>' +
      "</div>" +
      '<button class="nav-burger" id="nav-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav-drawer">' +
        '<span></span><span></span><span></span>' +
      "</button>" +
    "</div>" +
    '<div class="nav-drawer" id="nav-drawer" hidden>' + links +
      '<a class="drawer-cta" href="login.html?mode=signup&next=app.html">Start free sandbox</a>' +
      '<a class="drawer-alt" href="login.html">Sign in</a>' +
    "</div></nav>";
  }

  function wireBurger() {
    var btn = document.getElementById("nav-burger");
    var drawer = document.getElementById("nav-drawer");
    if (!btn || !drawer) return;
    btn.addEventListener("click", function () {
      var open = drawer.hidden;
      drawer.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.classList.toggle("open", open);
    });
    // Any resize back to desktop must not leave the drawer stuck open.
    window.addEventListener("resize", function () {
      if (window.innerWidth > 880 && !drawer.hidden) {
        drawer.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        btn.classList.remove("open");
      }
    });
  }

  function footerHTML() {
    var year = new Date().getFullYear();
    return '<footer><div class="wrap"><div class="cols">' +
      '<div class="col"><h4>Product</h4>' +
        '<a href="product.html">Overview</a><a href="pricing.html">Pricing</a>' +
        '<a href="demo.html">Live demo</a><a href="app.html">Console</a></div>' +
      '<div class="col"><h4>Developers</h4>' +
        '<a href="docs.html">API reference</a><a href="api-access.html">Request API access</a>' +
        '<a href="docs.html#webhooks">Webhooks</a><a href="docs.html#errors">Errors</a></div>' +
      '<div class="col"><h4>Company</h4>' +
        '<a href="contact.html">Contact</a><a href="contact.html?topic=partner">Become a design partner</a>' +
        '<a href="account.html">Your account</a></div>' +
      '<div class="col"><h4>Trust</h4>' +
        '<a href="security.html">Security</a><a href="privacy.html">Privacy</a>' +
        '<a href="terms.html">Terms</a><a href="contact.html?topic=security">Security review</a></div>' +
      "</div>" +
      '<div class="base"><span>© ' + year + ' Relay — post-booking integrity for flight &amp; hotel orders.</span>' +
      '<span class="mono">relay-travel.ai</span></div>' +
    "</div></footer>";
  }

  /** Swap the right-hand side for a signed-in user. */
  function renderUser(profile) {
    var host = document.getElementById("nav-right");
    if (!host) return;
    var name = profile.name || profile.email || "Account";
    var initial = (name.trim()[0] || "?").toUpperCase();

    host.innerHTML =
      '<div class="usermenu">' +
        '<button class="avatar" id="nav-avatar" aria-haspopup="true" aria-expanded="false" ' +
          'title="' + esc(name) + '">' + esc(initial) + "</button>" +
        '<div class="sheet" id="nav-sheet" hidden>' +
          '<div class="who"><b>' + esc(name) + "</b><span>" + esc(profile.email || "") + "</span></div>" +
          '<a href="account.html">Profile &amp; settings</a>' +
          '<a href="app.html">Console</a>' +
          '<a href="pricing.html">Plan &amp; billing</a>' +
          '<button type="button" class="out" id="nav-signout">Sign out</button>' +
        "</div>" +
      "</div>";

    var btn = document.getElementById("nav-avatar");
    var sheet = document.getElementById("nav-sheet");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      sheet.hidden = !sheet.hidden;
      btn.setAttribute("aria-expanded", String(!sheet.hidden));
    });
    document.addEventListener("click", function () {
      sheet.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    });
    sheet.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") sheet.hidden = true; });

    document.getElementById("nav-signout").addEventListener("click", async function () {
      var sb = client();
      if (sb) await sb.auth.signOut();
      location.href = "index.html";
    });
  }

  /** Resolve the signed-in user's display name, preferring what they chose. */
  async function loadProfile(sb) {
    var r = await sb.auth.getSession();
    var session = r.data && r.data.session;
    if (!session) return null;

    var meta = session.user.user_metadata || {};
    var name = (meta.full_name || meta.name || meta.user_name || "").trim();
    var workspaceId = null;
    try {
      var mem = await sb.from("workspace_members")
        .select("workspace_id, display_name").limit(1).maybeSingle();
      if (mem.data) {
        workspaceId = mem.data.workspace_id;
        if (mem.data.display_name) name = mem.data.display_name;
      }
    } catch (e) { /* not fatal — the nav still renders with the auth name */ }

    return {
      session: session,
      email: session.user.email,
      name: name || (session.user.email || "").split("@")[0],
      workspace_id: workspaceId,
    };
  }

  window.RelayNav = {
    client: client,

    /** Inject nav + footer. Returns the profile (or null) once auth resolves. */
    mount: async function (opts) {
      opts = opts || {};
      var navHost = document.getElementById("nav");
      var footHost = document.getElementById("site-footer");
      if (navHost) { navHost.innerHTML = navHTML(opts.active); wireBurger(); }
      if (footHost) footHost.innerHTML = footerHTML();

      // Signed-out visitors — the overwhelming majority on a marketing page —
      // never pay for the auth library at all.
      if (!hasStoredSession()) return null;
      if (!(window.RELAY_SETUP && window.RELAY_SETUP.isConfigured())) return null;

      var loaded = await ensureSupabase();
      if (!loaded) return null;

      var sb = client();
      if (!sb) return null;
      var profile = null;
      try { profile = await loadProfile(sb); } catch (e) { profile = null; }
      if (profile) renderUser(profile);
      return profile;
    },

    /** Gate a page behind sign-in. Redirects to login and comes back here. */
    /** Force the auth library to load — for pages that need a session, not just a nav. */
    ready: ensureSupabase,

    /** Cheap, synchronous: does this browser hold a Supabase session at all? */
    hasSession: hasStoredSession,

    require: async function (opts) {
      await ensureSupabase();
      var profile = await window.RelayNav.mount(opts);
      if (!profile) {
        var here = location.pathname.split("/").pop() + location.search;
        location.replace("login.html?next=" + encodeURIComponent(here));
        return null;
      }
      return profile;
    },
  };
})();

// Relay — configuration resolver and first-run setup.
//
// Config can come from two places:
//
//   1. config.js — the real answer. Edit it, deploy it, done.
//   2. This browser's localStorage — a convenience so you can try the console
//      before committing to a deploy cycle. Per-browser, never shared, and
//      overridden the moment config.js has real values in it.
//
// Both values are public by design: the publishable/anon key only grants what
// Row Level Security allows. A secret key must never be pasted here — the form
// below refuses one on sight.

(function () {
  var STORE_KEY = "relay-config-override";

  // A value is "unset" if it is missing, or is still one of the YOUR-... hints
  // from the config.js template.
  function isPlaceholder(v) {
    return !v || /YOUR[-_]/i.test(String(v));
  }

  // The key has two valid shapes: the new publishable key, or the legacy anon
  // key, which is a JWT. Anything else is a typo or the wrong field entirely.
  function looksLikeKey(v) {
    return /^sb_publishable_/i.test(v) || /^eyJ[\w-]+\./.test(v);
  }

  /** Why the file config can't be used — or "" if it can. */
  function fileProblem() {
    var c = window.RELAY_CONFIG || {};
    var urlBad = isPlaceholder(c.SUPABASE_URL);
    var keyBad = isPlaceholder(c.SUPABASE_ANON_KEY);

    if (urlBad && keyBad) return "empty";
    if (urlBad) return "url";
    if (keyBad) return "key";
    if (!looksLikeKey(c.SUPABASE_ANON_KEY)) return "keyshape";
    return "";
  }

  // THE BUG THIS EXISTS TO PREVENT
  //
  // This used to check the URL alone. A config.js with a real project URL and
  // the key still left as YOUR-PUBLISHABLE-OR-ANON-KEY therefore passed as
  // "configured": the console and the login page rendered normally, built a
  // Supabase client around a nonsense key, and every request failed with an
  // invalid-key error the visitor never saw. The site looked deployed and was
  // completely dead. A half-filled config now counts as no config, and the
  // screen below says exactly which field is missing.
  function fromFile() {
    return fileProblem() ? null : (window.RELAY_CONFIG || {});
  }

  function fromBrowser() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return c && c.SUPABASE_URL && c.SUPABASE_ANON_KEY ? c : null;
    } catch (e) { return null; }   // private window, blocked storage, bad JSON
  }

  // config.js wins. Once it's filled in properly, a stale browser override
  // can never shadow the deployed configuration.
  //
  // Provenance is captured HERE, before window.RELAY_CONFIG is reassigned —
  // asking fromFile() later would read back the value we just wrote and always
  // answer "from the file", so the temporary-config warning would never show.
  var problem = fileProblem();
  var fileCfg = fromFile();
  var resolved = fileCfg || fromBrowser();
  var source = fileCfg ? "file" : (resolved ? "browser" : "none");

  if (resolved) {
    // API_BASE must be an absolute https URL. On the live site it had been
    // filled in with the anon key by mistake — every Edge Function call then
    // resolved as a RELATIVE path against relay-travel.ai and 404'd, with
    // nothing in the UI to suggest why. Anything that isn't a URL is ignored
    // and rebuilt from SUPABASE_URL, which is always the right answer anyway.
    if (!/^https:\/\//i.test(String(resolved.API_BASE || ""))) {
      resolved.API_BASE = resolved.SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1";
    }
    window.RELAY_CONFIG = resolved;
  }

  window.RELAY_SETUP = {
    isConfigured: function () { return source !== "none"; },
    isTemporary: function () { return source === "browser"; },
    source: function () { return source; },
    fileProblem: function () { return problem; },

    clear: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    },

    /** Render the paste-your-config screen into a container element. */
    render: function (mountId) {
      var mount = document.getElementById(mountId);
      if (!mount) return;

      // If config.js was edited but left half-done, say which half. "It doesn't
      // work" is a much worse message than "the key is still the placeholder".
      function diagnosis() {
        if (problem === "key") {
          return '<div class="notice error"><b>Your <code>config.js</code> is half-filled.</b> ' +
            'The project URL is set, but <code>SUPABASE_ANON_KEY</code> is still ' +
            '<code>YOUR-PUBLISHABLE-OR-ANON-KEY</code>. Nothing can talk to the database until ' +
            'that is a real key. Paste it below to test now, then put it in ' +
            '<code>config.js</code> and redeploy.</div>';
        }
        if (problem === "keyshape") {
          return '<div class="notice error"><b>That key doesn\'t look right.</b> ' +
            'A publishable key starts <code>sb_publishable_</code> and a legacy anon key starts ' +
            '<code>eyJ</code>. Check you copied the whole value from Settings &rarr; API Keys.</div>';
        }
        if (problem === "url") {
          return '<div class="notice error"><b>Your <code>config.js</code> is half-filled.</b> ' +
            'The key is set but <code>SUPABASE_URL</code> is still the placeholder.</div>';
        }
        return "";
      }

      mount.innerHTML =
        '<div class="setup-wrap"><div class="setup-card">' +
          '<h1>Connect your database</h1>' +
          '<p class="sub">Relay needs your Supabase project before the console can show anything. ' +
            'Paste the two values below to try it in this browser, or set them permanently in ' +
            '<code>config.js</code> and redeploy.</p>' +
          '<div id="setup-msg"></div>' +
          diagnosis() +
          '<div class="field">' +
            '<label class="field-label" for="su-url">Project URL</label>' +
            '<input type="url" id="su-url" placeholder="https://abcdefgh1234.supabase.co" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label" for="su-key">Publishable (or anon) key</label>' +
            '<input type="text" id="su-key" placeholder="sb_publishable_… or eyJ…" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<button class="btn primary block" id="su-save" type="button">Connect</button>' +
          '<p class="setup-foot">Find both under <b>Settings → API Keys</b> in your Supabase project, ' +
            'or click <b>Connect</b> at the top of the project page.<br>' +
            'Saved to this browser only — nothing is sent anywhere.</p>' +
          '<p class="setup-warn"><b>Not the secret key.</b> The <code>service_role</code> / ' +
            '<code>sb_secret_</code> key bypasses every security policy and belongs only in ' +
            'your Edge Function settings. This form will reject it.</p>' +
        "</div></div>";

      var msg = document.getElementById("setup-msg");
      function say(text, kind) {
        msg.innerHTML = text ? '<div class="notice ' + (kind || "") + '">' + text + "</div>" : "";
      }

      document.getElementById("su-save").addEventListener("click", function () {
        var url = document.getElementById("su-url").value.trim().replace(/\/+$/, "");
        var key = document.getElementById("su-key").value.trim();

        if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
          say("That doesn't look like a Supabase project URL. It should be " +
              "<code>https://your-project-ref.supabase.co</code>.", "error");
          return;
        }
        if (!key) { say("Paste your publishable or anon key.", "error"); return; }

        // Refuse a secret key rather than quietly shipping it to the browser.
        if (/^sb_secret_/i.test(key) || /service_role/i.test(key)) {
          say("That's a <b>secret</b> key — it bypasses all security and must never go in a " +
              "browser. Use the publishable key (<code>sb_publishable_…</code>) or the legacy " +
              "anon key instead.", "error");
          return;
        }
        // The legacy anon key is a JWT whose payload names its role; catch a
        // pasted service_role JWT too, since it looks just like an anon key.
        if (/^eyJ/.test(key)) {
          try {
            var claims = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
            if (claims && claims.role && claims.role !== "anon") {
              say("That key's role is <code>" + String(claims.role).replace(/[<>&]/g, "") +
                  "</code>, not <code>anon</code>. Use the anon / publishable key.", "error");
              return;
            }
          } catch (e) { /* not a readable JWT; let it through and let Supabase judge */ }
        }

        try {
          localStorage.setItem(STORE_KEY, JSON.stringify({
            SUPABASE_URL: url,
            SUPABASE_ANON_KEY: key,
            API_BASE: url + "/functions/v1",
          }));
        } catch (e) {
          say("This browser is blocking local storage, so the values can't be saved here. " +
              "Put them in <code>config.js</code> instead.", "error");
          return;
        }

        say("Connected. Reloading…", "good");
        setTimeout(function () { location.reload(); }, 500);
      });
    },
  };
})();

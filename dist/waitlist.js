/* Waitlist submission. Posts straight to PostgREST; no SDK, no build step. */
(function () {
  "use strict";

  var form   = document.getElementById("wl-form");
  var done   = document.getElementById("wl-done");
  var msgEl  = document.getElementById("wl-msg");
  var button = document.getElementById("wl-submit");
  if (!form) return;

  var cfg = window.RELAY_CONFIG || {};
  var PLACEHOLDER = /^(YOUR[_-]|your[_-]|xxx|TODO|changeme|paste|REPLACE)/i;

  function configured() {
    return !!(cfg.SUPABASE_URL &&
              /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.SUPABASE_URL) &&
              cfg.SUPABASE_ANON_KEY &&
              cfg.SUPABASE_ANON_KEY.length > 20 &&
              !PLACEHOLDER.test(cfg.SUPABASE_ANON_KEY));
  }

  function say(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "form-msg show " + (kind || "");
  }
  function clear() { msgEl.textContent = ""; msgEl.className = "form-msg"; }

  // Deliberately permissive: the database holds the real rule. This only
  // catches the typo before it costs the user a round trip.
  function emailLooksReal(v) {
    return v.length >= 5 && v.length <= 254 &&
           /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v);
  }

  function picked(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "unknown";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clear();

    var email = form.elements.email.value.trim();
    if (!emailLooksReal(email)) {
      say("That email doesn't look right — check it and try again.", "err");
      form.elements.email.focus();
      return;
    }

    var sizeRaw = form.elements.group_size.value.trim();
    var size = sizeRaw === "" ? null : parseInt(sizeRaw, 10);
    if (size !== null && (isNaN(size) || size < 2 || size > 60)) {
      say("Group size should be a number between 2 and 60.", "err");
      form.elements.group_size.focus();
      return;
    }

    if (!configured()) {
      say("The waitlist isn't connected yet. Email tlong7@uw.edu and we'll add you by hand.", "err");
      return;
    }

    var row = {
      email: email,
      name: form.elements.name.value.trim() || null,
      chat_app: picked("chat_app"),
      trip_window: picked("trip_window"),
      group_size: size,
      note: form.elements.note.value.trim() || null,
      source: (location.pathname + location.search).slice(0, 120),
      user_agent: navigator.userAgent.slice(0, 400)
    };

    button.disabled = true;
    var original = button.textContent;
    button.textContent = "Adding you…";

    var url = cfg.SUPABASE_URL.replace(/\/+$/, "") +
              "/rest/v1/" + (cfg.WAITLIST_TABLE || "waitlist");

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(row)
    })
      .then(function (res) {
        if (res.ok) return { ok: true };
        // 409 is the unique index on lower(email): they already signed up.
        if (res.status === 409) return { ok: true, dupe: true };
        return res.text().then(function (t) {
          return { ok: false, status: res.status, body: t };
        });
      })
      .then(function (r) {
        if (r.ok) {
          form.style.display = "none";
          done.classList.add("show");
          if (r.dupe) {
            done.querySelector("h3").textContent = "You're already on the list.";
          }
          done.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        button.disabled = false;
        button.textContent = original;
        if (r.status === 401 || r.status === 403) {
          say("We couldn't save that — our end. Email tlong7@uw.edu and we'll add you.", "err");
        } else {
          say("Something went wrong saving that. Try again, or email tlong7@uw.edu.", "err");
        }
        if (window.console) console.error("waitlist", r.status, r.body);
      })
      .catch(function (err) {
        button.disabled = false;
        button.textContent = original;
        say("Couldn't reach the server. Check your connection and try again.", "err");
        if (window.console) console.error("waitlist", err);
      });
  });
})();

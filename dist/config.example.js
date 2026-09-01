// Relay — front-end configuration (template).
//
// Copy this file to config.js and fill in the values for your own Supabase
// project. config.js is gitignored, so the real values never land in the repo;
// this example file is what gets committed instead.
//
// Both values are PUBLIC and safe to ship in the browser. The key only ever
// grants what Row Level Security allows — rows belonging to the workspace the
// signed-in user is a member of, and nothing else.
//
// NEVER put a secret / service_role key in this file. Those bypass RLS
// entirely and belong only in the Edge Function's environment variables.
//
// Where to find these: Supabase Dashboard → your project → Settings → API Keys.
// Prefer the "Publishable key" (sb_publishable_...) over the legacy anon key
// (eyJ...) where available.
window.RELAY_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-PUBLISHABLE-OR-ANON-KEY",

  // Where the public API lives. Shown in the console so customers can copy it.
  API_BASE: "https://YOUR-PROJECT.supabase.co/functions/v1",
};

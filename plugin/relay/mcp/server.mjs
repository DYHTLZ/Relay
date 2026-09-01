#!/usr/bin/env node
//
// Relay MCP server — stdio, zero dependencies.
//
// Speaks MCP over JSON-RPC on stdin/stdout. No SDK: the surface we need is
// three methods (initialize, tools/list, tools/call), and a dependency-free
// server is one that still starts in two years without an npm install.
//
// Config, via environment:
//   RELAY_API_KEY   required — sk_test_... or sk_live_..., from the Relay console
//   RELAY_API_BASE  optional — defaults to Relay's hosted API
//
// The key is read from the environment and never logged, never echoed back in
// a tool result, and never written to disk.

import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2024-11-05";
const API_BASE = (process.env.RELAY_API_BASE || "https://api.relay-travel.ai/v1")
  .replace(/\/+$/, "");
const API_KEY = process.env.RELAY_API_KEY || "";

// stdout is the JSON-RPC channel. Anything written there that isn't a response
// corrupts the stream, so every diagnostic goes to stderr.
const log = (...a) => console.error("[relay]", ...a);

// ---------------------------------------------------------------------------
// Flag reference — local, so Claude can explain a verdict without a round trip.
// ---------------------------------------------------------------------------
const FLAGS = {
  unissued_after_charge: {
    meaning: "Money was captured but the supplier order failed. The traveller paid for nothing.",
    severity: "critical",
    resolution: "Reverse the charge — money was taken and no product was delivered.",
  },
  duplicate_charge: {
    meaning: "More than one capture exists for a single order, usually a retried request.",
    severity: "critical",
    resolution: "Refund the duplicate capture; keep the single confirmed order.",
  },
  partial_order: {
    meaning: "Only part of the itinerary was confirmed — e.g. the outbound issued, the return did not.",
    severity: "critical",
    resolution: "Cancel and refund the failed leg, keep the confirmed leg, offer re-booking.",
  },
  price_drift: {
    meaning: "The amount charged does not equal the amount the traveller agreed to.",
    severity: "warning",
    resolution: "Refund the difference, or request re-confirmation from the customer.",
  },
  currency_mismatch: {
    meaning: "The charge was taken in a different currency than the one quoted.",
    severity: "critical",
    resolution: "Hold and escalate — charged currency differs from the quoted currency.",
  },
  refund_not_landed: {
    meaning: "A refund was initiated more than five days ago and never settled.",
    severity: "critical",
    resolution: "Escalate to the payment provider — refund initiated but never settled.",
  },
  date_mismatch: {
    meaning: "The confirmed departure date is not the date that was sold.",
    severity: "critical",
    resolution: "Escalate immediately — a wrong date risks a missed flight.",
  },
  route_mismatch: {
    meaning: "The confirmed route is not the route that was sold.",
    severity: "critical",
    resolution: "Escalate immediately — the confirmed route is not what was sold.",
  },
  passenger_mismatch: {
    meaning: "The confirmed passenger name differs from the name on the agreement.",
    severity: "critical",
    resolution: "Request a name correction with the airline before departure.",
  },
  fare_rule_drift: {
    meaning: "Sold as refundable, confirmed as non-refundable (or vice versa).",
    severity: "warning",
    resolution: "Notify the customer that the fare rules changed before they rely on them.",
  },
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const VIEW = (label, extra = {}) => ({
  type: "object",
  description: label,
  properties: {
    amount: { type: "number", description: "Total in major units, e.g. 2480.00 — not cents." },
    currency: { type: "string", description: "ISO 4217, e.g. USD." },
    route: { type: "string", description: 'e.g. "SFO-NRT".' },
    depart_date: { type: "string", description: "YYYY-MM-DD." },
    passenger: { type: "string", description: "Passenger name as it appears on this record." },
    refundable: { type: "boolean" },
    ...extra,
  },
  additionalProperties: true,
});

const TOOLS = [
  {
    name: "relay_reconcile_order",
    description:
      "Check one travel order for post-booking failures. Send the three views of it — what the " +
      "traveller agreed to buy, what was actually charged, and what the supplier confirmed — and " +
      "Relay returns a verdict (cleared or flagged), the specific flags, a recommended resolution " +
      "and a severity. Use this immediately after any booking or charge, and whenever someone asks " +
      "whether an order went through correctly. Fields you don't have can be omitted: a missing " +
      "field is never treated as a mismatch.",
    inputSchema: {
      type: "object",
      required: ["order_id"],
      properties: {
        order_id: { type: "string", description: "Your own identifier for this order. Reused calls update the same order." },
        agreed: VIEW("What the customer agreed to buy."),
        charged: VIEW("What the payment processor actually captured.", {
          processor: { type: "string", description: 'e.g. "stripe".' },
          charge_id: { type: "string" },
          capture_count: { type: "number", description: "How many captures exist. More than 1 is a duplicate charge." },
          refund_initiated_at: { type: "string", description: "ISO timestamp, if a refund was started." },
          refund_settled_at: {
            type: "string",
            description:
              "ISO timestamp of when the refund actually SETTLED. Omit it while a refund is " +
              "still in flight. This must be a timestamp, not a boolean — Relay ignores an " +
              "unrecognised field, so sending refund_settled:true would leave a landed refund " +
              "looking unsettled and flag it after five days. A false positive on money the " +
              "customer already received.",
          },
        }),
        confirmed: VIEW(
          "What the supplier came back with. OMIT THIS ENTIRELY if the supplier has not " +
          "responded yet — Relay then holds the order open and watches it against the " +
          "ticketing deadline. Do not send an empty or invented confirmation to fill the gap.",
          {
            supplier: { type: "string", description: 'e.g. "duffel", "amadeus".' },
            status: { type: "string", description: 'e.g. "issued", "ticketed", "pending", "failed", "partial".' },
          },
        ),
        mode: { type: "string", enum: ["test", "live"], description: "Defaults to whatever the API key is." },
      },
    },
  },
  {
    name: "relay_get_order",
    description:
      "Look up one order Relay has already seen, by the order_id you gave it. Returns the stored " +
      "three views, the current verdict and flags, and where it is in its lifecycle — including " +
      "whether Relay is still holding it open waiting for the supplier to confirm.",
    inputSchema: {
      type: "object",
      required: ["order_id"],
      properties: { order_id: { type: "string" } },
    },
  },
  {
    name: "relay_list_orders",
    description:
      "List orders Relay is tracking, newest first. Use it to answer 'what's broken right now', " +
      "'which orders are still waiting on the supplier', or 'show me this week's failures'. " +
      "Filter by verdict or lifecycle state.",
    inputSchema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["flagged", "cleared"] },
        state: { type: "string", enum: ["open", "settled"], description: "open = Relay is still waiting on someone." },
        flag: { type: "string", description: "Only orders carrying this flag code." },
        limit: { type: "number", description: "Default 20, max 100." },
      },
    },
  },
  {
    name: "relay_explain_flag",
    description:
      "Explain what a Relay flag code means, how serious it is, and what to do about it. Answered " +
      "locally with no network call. Omit the code to list all ten.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", description: "e.g. unissued_after_charge. Omit to list every flag." } },
    },
  },
  {
    name: "relay_status",
    description:
      "Check that this Relay connection is configured and the API is reachable. Run it first when " +
      "any other Relay tool fails, to tell a missing key apart from an outage.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function relayFetch(path, init = {}) {
  if (!API_KEY) {
    return {
      ok: false,
      status: 0,
      body: {
        error: "no_api_key",
        message:
          "RELAY_API_KEY is not set. Create a key in the Relay console (relay-travel.ai/app.html " +
          "→ API Keys) and set it in this plugin's environment.",
      },
    };
  }
  let res;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, status: 0, body: { error: "unreachable", message: String(e.message || e) } };
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 800) }; }
  return { ok: res.ok, status: res.status, body };
}

/** Turn a failed call into something Claude can act on rather than a stack trace. */
function explainFailure(r) {
  const m = {
    0: `Could not reach the Relay API at ${API_BASE}` +
       (r.body?.message ? ` — ${r.body.message}.` : ".") +
       " Check the machine is online and RELAY_API_BASE points at a running Relay deployment.",
    401: "That Relay API key was rejected. Check RELAY_API_KEY — keys are shown once at creation and cannot be recovered, so if it's lost, make a new one.",
    404: "Relay has no order with that id. It may not have been reconciled yet.",
    429: "Rate limited by Relay. Wait and retry.",
  };
  return m[r.status] || `Relay returned ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`;
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------
async function callTool(name, args = {}) {
  switch (name) {
    case "relay_explain_flag": {
      if (!args.code) return { flags: FLAGS };
      const f = FLAGS[args.code];
      return f
        ? { code: args.code, ...f }
        : { error: "unknown_flag", code: args.code, known: Object.keys(FLAGS) };
    }

    case "relay_status": {
      const configured = Boolean(API_KEY);
      const mode = API_KEY.startsWith("sk_live_")
        ? "live"
        : API_KEY.startsWith("sk_test_")
          ? "test"
          : "unknown";
      if (!configured) {
        return {
          configured: false,
          api_base: API_BASE,
          message: "RELAY_API_KEY is not set, so no Relay tool can run. Create one at relay-travel.ai/app.html → API Keys.",
        };
      }
      const r = await relayFetch("/reconcile", { method: "POST", body: JSON.stringify({}) });
      // A 400 here is a healthy sign: the key was accepted and the empty body rejected.
      const reachable = r.status > 0;
      const keyAccepted = r.status !== 401;
      return {
        configured: true,
        api_base: API_BASE,
        key_mode: mode,
        reachable,
        key_accepted: keyAccepted,
        message: !reachable
          ? "Relay is unreachable from this machine."
          : keyAccepted
            ? "Connected. The key was accepted."
            : "Reachable, but the key was rejected.",
      };
    }

    case "relay_reconcile_order": {
      const payload = {
        order_id: args.order_id,
        agreed: args.agreed ?? {},
        charged: args.charged ?? {},
        confirmed: args.confirmed ?? {},
      };
      if (args.mode) payload.mode = args.mode;
      const r = await relayFetch("/reconcile", { method: "POST", body: JSON.stringify(payload) });
      if (!r.ok) return { error: true, status: r.status, message: explainFailure(r), detail: r.body };
      return r.body;
    }

    case "relay_get_order": {
      const r = await relayFetch(`/orders/${encodeURIComponent(args.order_id)}`);
      if (!r.ok) return { error: true, status: r.status, message: explainFailure(r) };
      return r.body;
    }

    case "relay_list_orders": {
      const q = new URLSearchParams();
      if (args.verdict) q.set("verdict", args.verdict);
      if (args.state) q.set("state", args.state);
      if (args.flag) q.set("flag", args.flag);
      q.set("limit", String(Math.min(Number(args.limit) || 20, 100)));
      const r = await relayFetch(`/orders?${q}`);
      if (!r.ok) return { error: true, status: r.status, message: explainFailure(r) };
      return r.body;
    }

    default:
      return { error: "unknown_tool", name };
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC loop
// ---------------------------------------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(req) {
  const { id, method, params } = req;

  // Notifications carry no id and must never be answered.
  if (id === undefined || id === null) return;

  try {
    switch (method) {
      case "initialize":
        return send({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "relay", version: "0.1.0" },
          },
        });

      case "ping":
        return send({ jsonrpc: "2.0", id, result: {} });

      case "tools/list":
        return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });

      case "tools/call": {
        const result = await callTool(params?.name, params?.arguments || {});
        const isError = Boolean(result && result.error);
        return send({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError,
          },
        });
      }

      default:
        return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (e) {
    log("handler error", e);
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e.message || e) } });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let req;
  try { req = JSON.parse(t); } catch { return log("could not parse line"); }
  handle(req);
});

log(`ready — API base ${API_BASE}, key ${API_KEY ? "set" : "MISSING"}`);

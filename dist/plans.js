// Relay — the plan catalogue. THIS IS THE ONE PLACE TO EDIT PRICING.
//
// pricing.html renders from this file and checkout.html reads it back, so the
// two can never drift apart. The numbers below are placeholders chosen to look
// plausible next to comparable infrastructure pricing — change them freely.
//
// `stripe_price_id` stays empty until you create the products in Stripe. The
// checkout function refuses to charge for a plan with no price id rather than
// inventing one, so a half-configured plan fails loudly instead of quietly
// billing the wrong amount.

window.RELAY_PLANS = [
  {
    id: "sandbox",
    name: "Sandbox",
    price: 0,
    price_label: "$0",
    period: "forever",
    blurb: "Everything working end to end, against test data. No card.",
    included_orders: 500,
    overage: null,
    features: [
      "500 reconciliations / month",
      "Sandbox API keys",
      "All ten detection rules",
      "7-day order history",
      "Community support",
    ],
    cta: "Create a free account",
    action: "signup",
    stripe_price_id: "",
  },
  {
    id: "growth",
    name: "Growth",
    price: 249,
    price_label: "$249",
    period: "per month",
    blurb: "For a live product with real travellers and real money moving.",
    included_orders: 10000,
    overage: 0.02,
    featured: true,
    features: [
      "10,000 reconciliations / month",
      "$0.02 per order after that",
      "Live API keys + outbound webhooks",
      "The watcher — deadline sweeps on open orders",
      "One-click fixes — refunds and cancellations, approve-first",
      "12-month order history",
      "Email support, one business day",
    ],
    cta: "Choose Growth",
    action: "checkout",
    stripe_price_id: "",
  },
  {
    id: "scale",
    name: "Scale",
    price: 1200,
    price_label: "$1,200",
    period: "per month",
    blurb: "Volume, custom watch policies, and someone to call.",
    included_orders: 100000,
    overage: 0.012,
    features: [
      "100,000 reconciliations / month",
      "$0.012 per order after that",
      "Custom watch policies and deadlines",
      "Automatic fixes below a ceiling you set",
      "Provider connections (Stripe, Duffel, more)",
      "Shared Slack channel",
      "99.9% uptime commitment",
    ],
    cta: "Choose Scale",
    action: "checkout",
    stripe_price_id: "",
  },
];

window.RELAY_PLAN = function (id) {
  return (window.RELAY_PLANS || []).filter(function (p) { return p.id === id; })[0] || null;
};

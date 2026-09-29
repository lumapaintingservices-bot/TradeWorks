// TradeWorks calendar feed — Cloudflare Worker (module syntax).
// Serves https://<worker>/<token>.ics by reading the Firestore document calfeed/<token>
// that the TradeWorks app keeps up to date. Google / Apple / Outlook subscribe to that URL.
// Required variable: FIREBASE_PROJECT_ID (Workers > your worker > Settings > Variables).
export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    if (!env.FIREBASE_PROJECT_ID) return new Response("Set the FIREBASE_PROJECT_ID variable on this worker.", { status: 500 });
    const m = new URL(request.url).pathname.match(/\/([A-Za-z0-9]{16,64})(\.ics)?$/);
    if (!m) return new Response("TradeWorks calendar", { status: 404 });
    const api = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) +
      "/databases/(default)/documents/calfeed/" + m[1];
    const r = await fetch(api);
    if (!r.ok) return new Response("Not found", { status: 404 });
    const j = await r.json();
    const ics = (j.fields && j.fields.ics && j.fields.ics.stringValue) || "";
    if (!ics) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "max-age=300" },
    });
  },
};

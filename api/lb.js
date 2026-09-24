// Shared leaderboard.
//   POST {u, s}  = submit a score (first attempt per username is locked)
//   GET          = top 10 (open /api/lb in a browser to check that storage is connected)
// Needs Upstash Redis connected in Vercel > Storage. Without it the quiz falls back to per-device scores.
let redis = null, setupError = "";
try {
  const { Redis } = require("@upstash/redis");
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
  else setupError = "storage not connected: Vercel > Storage > Upstash Redis > connect to this project, then redeploy";
} catch (e) {
  setupError = "@upstash/redis missing: upload package.json to the repo root and redeploy";
}
const KEY = "fhx:lb";

async function all() {
  const h = (await redis.hgetall(KEY)) || {};
  return Object.values(h).map(v => (typeof v === "string" ? JSON.parse(v) : v)).sort((a, b) => b.s - a.s || a.t - b.t);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!redis) return res.status(501).json({ error: setupError });
  try {
    if (req.method === "GET") {
      const lb = await all();
      return res.status(200).json({ ok: true, storage: "connected", total: lb.length, top: lb.slice(0, 10).map(r => ({ u: r.u, s: r.s })) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const { u, s } = req.body || {};
    const score = Number.isInteger(s) ? s : -1;
    if (!/^[A-Za-z0-9_]{1,15}$/.test(String(u || "")) || score < 0 || score > 20) return res.status(400).json({ error: "bad input" });
    const field = u.toLowerCase();
    const isFirstAttempt = (await redis.hsetnx(KEY, field, JSON.stringify({ u, s: score, t: Date.now() }))) === 1;
    const lb = await all();
    const rank = lb.findIndex(r => r.u.toLowerCase() === field) + 1;
    const mine = lb[rank - 1];
    return res.status(200).json({ rank, total: lb.length, lockedScore: mine.s, isFirstAttempt, top: lb.slice(0, 10).map(r => ({ u: r.u, s: r.s })) });
  } catch (e) {
    return res.status(500).json({ error: "storage error: " + String(e && e.message).slice(0, 100) });
  }
};

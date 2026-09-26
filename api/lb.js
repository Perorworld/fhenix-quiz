// Shared leaderboard. POST {u, s} = submit (first attempt per username is locked), GET = top 10.
// DELETE (with header x-admin-key matching LB_ADMIN_KEY) = wipe the whole leaderboard once.
// Needs the Upstash Redis integration on Vercel. Without it this returns 501 and the quiz falls back to per-device scores.
const { Redis } = require("@upstash/redis");
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const KEY = "fhx:lb";

// Must match CONFIG.NUM_QUESTIONS in index.html (currently 6). Bump this
// alongside that value if the daily quiz length ever changes again.
const MAX_SCORE = 6;

async function all() {
  const h = (await redis.hgetall(KEY)) || {};
  return Object.values(h).map(v => (typeof v === "string" ? JSON.parse(v) : v)).sort((a, b) => b.s - a.s || a.t - b.t);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!redis) return res.status(501).json({ error: "leaderboard storage not configured" });
  try {
    if (req.method === "GET") {
      const lb = await all();
      return res.status(200).json({ total: lb.length, top: lb.slice(0, 10).map(r => ({ u: r.u, s: r.s })) });
    }

    // One-time wipe: set LB_ADMIN_KEY in your Vercel project's env vars, then
    // call this once with header "x-admin-key: <that value>". Remove the env
    // var afterward (or rotate it) so the endpoint can't be hit again.
    if (req.method === "DELETE") {
      const adminKey = process.env.LB_ADMIN_KEY;
      if (!adminKey) return res.status(501).json({ error: "reset not configured" });
      if (req.headers["x-admin-key"] !== adminKey) return res.status(401).json({ error: "unauthorized" });
      await redis.del(KEY);
      return res.status(200).json({ ok: true, cleared: true });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const { u, s } = req.body || {};
    const score = Number.isInteger(s) ? s : -1;
    if (!/^[A-Za-z0-9_]{1,15}$/.test(String(u || "")) || score < 0 || score > MAX_SCORE) return res.status(400).json({ error: "bad input" });
    const field = u.toLowerCase();
    const isFirstAttempt = (await redis.hsetnx(KEY, field, JSON.stringify({ u, s: score, t: Date.now() }))) === 1;
    const lb = await all();
    const rank = lb.findIndex(r => r.u.toLowerCase() === field) + 1;
    const mine = lb[rank - 1];
    return res.status(200).json({ rank, total: lb.length, lockedScore: mine.s, isFirstAttempt, top: lb.slice(0, 10).map(r => ({ u: r.u, s: r.s })) });
  } catch (e) {
    return res.status(500).json({ error: "leaderboard error" });
  }
};

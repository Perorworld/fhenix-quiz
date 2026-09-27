// Shared leaderboard + cross-device progress.
// GET            = top 25, ranked by cumulative points.
// GET ?u=name    = that user's own record + cooldown/rank, so any browser can sync to it.
// POST {u, sc}   = submit a completed attempt (sc = raw correct answers out of NUM_QUESTIONS).
//                  Adds to the user's cumulative points/streak. Rejected (accepted:false) if
//                  they're still in cooldown, so a stray/duplicate call can't double-count.
// DELETE (header x-admin-key: LB_ADMIN_KEY) = wipe the whole leaderboard once.
// Needs the Upstash Redis integration on Vercel. Without it this returns 501 and the quiz falls back to per-device scores.
const { Redis } = require("@upstash/redis");
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const KEY = "fhx:lb";
const TOP_LIMIT = 25;

// Keep these in sync with CONFIG in index.html.
const NUM_QUESTIONS = 6;
const COOLDOWN_MS = 24 * 3600 * 1000;
const STREAK_WINDOW_MS = 48 * 3600 * 1000;
const POINT_THRESHOLDS = [
  { min: 95, pts: 5 },
  { min: 75, pts: 4 },
  { min: 50, pts: 3 },
  { min: 0, pts: 2 }
];

function pointsForPct(pct) {
  for (const t of POINT_THRESHOLDS) if (pct >= t.min) return t.pts;
  return 0;
}

function blank(u) {
  return { u, totalPoints: 0, quizzesCompleted: 0, bestScore: 0, bestPct: 0, streak: 0, lastTs: 0, lastScore: 0, lastPoints: 0 };
}

// Older deploys of this file stored a single locked-in record shaped
// { u, s, t } (one score, captured only on a user's very first-ever
// submission). Rather than wiping that history, treat it as one completed
// attempt and fold it into the new cumulative shape: it becomes their
// starting totalPoints/streak instead of being lost. Records already in the
// new shape (a numeric totalPoints) pass through unchanged.
function normalizeRecord(u, raw) {
  if (!raw) return blank(u);
  const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof rec.totalPoints === "number") return rec;
  const score = Number.isFinite(rec.s) ? rec.s : 0;
  const pct = (score / NUM_QUESTIONS) * 100;
  const pts = pointsForPct(pct);
  return {
    u: rec.u || u,
    totalPoints: pts,
    quizzesCompleted: 1,
    bestScore: score,
    bestPct: pct,
    streak: 1,
    lastTs: rec.t || 0,
    lastScore: score,
    lastPoints: pts
  };
}

function isValidHandle(u) {
  return /^[A-Za-z0-9_]{1,15}$/.test(String(u || ""));
}

async function all() {
  const h = (await redis.hgetall(KEY)) || {};
  return Object.entries(h)
    .map(([field, v]) => normalizeRecord(field, v))
    .sort((a, b) => b.totalPoints - a.totalPoints || a.lastTs - b.lastTs);
}

function topRows(lb) {
  return lb.slice(0, TOP_LIMIT).map(r => ({ u: r.u, totalPoints: r.totalPoints, streak: r.streak, quizzesCompleted: r.quizzesCompleted }));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!redis) return res.status(501).json({ error: "leaderboard storage not configured" });
  try {
    if (req.method === "GET") {
      const qUser = (req.query && req.query.u) || "";
      const lb = await all();

      if (qUser) {
        if (!isValidHandle(qUser)) return res.status(400).json({ error: "bad input" });
        const field = qUser.toLowerCase();
        const raw = await redis.hget(KEY, field);
        const rec = normalizeRecord(qUser, raw);
        const rankIdx = lb.findIndex(r => r.u.toLowerCase() === field);
        return res.status(200).json({
          record: rec,
          cooldownMsLeft: Math.max(0, (rec.lastTs || 0) + COOLDOWN_MS - Date.now()),
          rank: rankIdx >= 0 ? rankIdx + 1 : null,
          total: lb.length,
          top: topRows(lb)
        });
      }

      return res.status(200).json({ total: lb.length, top: topRows(lb) });
    }

    if (req.method === "DELETE") {
      const adminKey = process.env.LB_ADMIN_KEY;
      if (!adminKey) return res.status(501).json({ error: "reset not configured" });
      if (req.headers["x-admin-key"] !== adminKey) return res.status(401).json({ error: "unauthorized" });
      await redis.del(KEY);
      return res.status(200).json({ ok: true, cleared: true });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const { u, sc } = req.body || {};
    const score = Number.isInteger(sc) ? sc : -1;
    if (!isValidHandle(u) || score < 0 || score > NUM_QUESTIONS) return res.status(400).json({ error: "bad input" });
    const field = u.toLowerCase();

    const existingRaw = await redis.hget(KEY, field);
    const prev = normalizeRecord(u, existingRaw);

    const now = Date.now();
    const cooldownLeft = prev.lastTs ? Math.max(0, prev.lastTs + COOLDOWN_MS - now) : 0;

    if (cooldownLeft > 0) {
      // Still cooling down server-side — don't touch their record, just report it as-is.
      const lb = await all();
      const rankIdx = lb.findIndex(r => r.u.toLowerCase() === field);
      return res.status(200).json({
        rank: rankIdx >= 0 ? rankIdx + 1 : null,
        total: lb.length,
        record: prev,
        cooldownMsLeft: cooldownLeft,
        accepted: false,
        top: topRows(lb)
      });
    }

    const pct = (score / NUM_QUESTIONS) * 100;
    const pts = pointsForPct(pct);
    const gap = prev.lastTs ? now - prev.lastTs : Infinity;
    const streak = prev.lastTs && gap <= STREAK_WINDOW_MS ? prev.streak + 1 : 1;

    const updated = {
      u,
      totalPoints: prev.totalPoints + pts,
      quizzesCompleted: prev.quizzesCompleted + 1,
      bestScore: Math.max(prev.bestScore, score),
      bestPct: Math.max(prev.bestPct, pct),
      streak,
      lastTs: now,
      lastScore: score,
      lastPoints: pts
    };
    await redis.hset(KEY, { [field]: JSON.stringify(updated) });

    const lb = await all();
    const rankIdx = lb.findIndex(r => r.u.toLowerCase() === field);
    return res.status(200).json({
      rank: rankIdx >= 0 ? rankIdx + 1 : null,
      total: lb.length,
      record: updated,
      cooldownMsLeft: COOLDOWN_MS,
      accepted: true,
      top: topRows(lb)
    });
  } catch (e) {
    return res.status(500).json({ error: "leaderboard error" });
  }
};

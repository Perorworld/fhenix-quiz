// GET /api/share?name=Peror&score=17&total=20&rank=3
// X reads this page's meta tags for the card, then real visitors are sent on to the quiz.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = (req, res) => {
  const q = req.query || {};
  const name = String(q.name || "player").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "player";
  const total = Math.min(50, Math.max(1, parseInt(q.total, 10) || 20));
  const score = Math.min(total, Math.max(0, parseInt(q.score, 10) || 0));
  const rank = parseInt(q.rank, 10) > 0 ? parseInt(q.rank, 10) : 0;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = "https://" + host;
  const qs = "name=" + name + "&score=" + score + "&total=" + total + (rank ? "&rank=" + rank : "");
  const image = origin + "/api/og?" + qs;
  const title = "@" + name + " scored " + score + "/" + total + " on the Fhenix Privacy Quiz";
  const desc = "Think you understand FHE and confidential computation? Take the Fhenix Privacy Quiz at " + host + " and beat this score.";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${esc(origin + "/api/share?" + qs)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=/"></head><body><script>location.replace("/")</script><a href="/">Take the Fhenix Privacy Quiz</a></body></html>`);
};

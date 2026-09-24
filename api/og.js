// GET /api/og?name=Peror&score=17&total=20&rank=3  ->  1200x630 PNG share card
const tier = p => (p >= 90 ? "FHE ARCHITECT" : p >= 70 ? "CIPHER BUILDER" : p >= 40 ? "ENCRYPTED EXPLORER" : "PLAINTEXT ROOKIE");
const el = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });

module.exports = async (req, res) => {
  try {
    const { ImageResponse } = await import("@vercel/og");
    // logo.png sits in the site root; it is read here and embedded in the card
    let logo = "";
    try {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const h = req.headers["x-forwarded-host"] || req.headers.host;
      const r = await fetch(proto + "://" + h + "/logo.png");
      if (r.ok) logo = "data:image/png;base64," + Buffer.from(await r.arrayBuffer()).toString("base64");
    } catch (e) {}
    const q = req.query || {};
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").replace(/[^A-Za-z0-9.\-:]/g, "");
    const name = String(q.name || "player").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "player";
    const total = Math.min(50, Math.max(1, parseInt(q.total, 10) || 20));
    const score = Math.min(total, Math.max(0, parseInt(q.score, 10) || 0));
    const rank = parseInt(q.rank, 10) > 0 ? parseInt(q.rank, 10) : 0;
    const pct = Math.round((score / total) * 100);

    const card = el("div", { width: "100%", height: "100%", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", color: "#efeaff",
        background: "linear-gradient(135deg,#0a0713 0%,#1a1040 60%,#0a0713 100%)", border: "2px solid #2a2148" }, [
      el("div", { justifyContent: "space-between", alignItems: "center" }, [
        logo ? { type: "img", props: { src: logo, height: 56, style: { height: 56 } } } : el("div", { fontSize: 36, letterSpacing: 8 }, "FHENIX"),
        el("div", { fontSize: 22, letterSpacing: 6, color: "#38bdf8" }, "FHENIX PRIVACY QUIZ"),
      ]),
      el("div", { flexDirection: "column" }, [
        el("div", { fontSize: 34, color: "#8f86b3" }, "@" + name),
        el("div", { alignItems: "flex-end", marginTop: 6 }, [
          el("div", { fontSize: 210, lineHeight: 1, color: "#a78bfa" }, String(score)),
          el("div", { fontSize: 80, color: "#8f86b3", paddingBottom: 26, marginLeft: 12 }, "/ " + total),
        ]),
      ]),
      el("div", { justifyContent: "space-between", alignItems: "center" }, [
        el("div", { fontSize: 30, letterSpacing: 4, color: "#38bdf8", border: "2px solid #8b5cf6", borderRadius: 40, padding: "12px 28px" }, tier(pct)),
        el("div", { flexDirection: "column", alignItems: "flex-end" }, [
          el("div", { fontSize: 28, color: "#8f86b3" }, pct + "% accuracy" + (rank ? "  |  Rank #" + rank : "")),
          el("div", { fontSize: 32, color: "#38bdf8", marginTop: 12 }, "Try it yourself: " + host),
        ]),
      ]),
    ]);
    const img = new ImageResponse(card, { width: 1200, height: 630 });
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).end(buf);
  } catch (e) {
    res.status(500).json({ error: "og failed" });
  }
};

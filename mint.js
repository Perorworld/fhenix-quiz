// mint.js — mints the Fhenix Quiz Soulbound Badge, talking directly to your
// thirdweb ERC-721 contract (window.BADGE_ADDRESS) with ethers.js.
//
// Why this version: an earlier version of this file pulled in the full thirdweb v5 SDK
// from esm.sh. That's a very large, deep dependency tree, and a likely reason the module
// failed to load at all (you'd see "Mint module not loaded" even though mint.js was
// correctly deployed, because the script errors out on import before it ever reaches
// `window.mintBadgeOnchain = ...`). This version uses only ethers.js — one small,
// well-established library — to remove that whole class of failure.
//
// If you STILL see "Mint module not loaded" after deploying this file, it is almost
// certainly a hosting/deployment issue, not a code issue:
//   1. Open https://YOURSITE/mint.js directly in a browser tab. It must show this JS
//      source. If it shows your index.html instead, your host has a catch-all/SPA
//      rewrite rule that's swallowing the /mint.js request — you need to exclude
//      static files (or *.js) from that rewrite.
//   2. Open DevTools -> Network tab, reload, click the mint.js request, check
//      "Response Headers" -> Content-Type. It must be a JS type (text/javascript,
//      application/javascript). If it's text/html, same root cause as above.
//   3. Confirm mint.js sits in the exact same folder you deployed index.html to.
//
// This module tries several common public-mint function signatures against your
// contract, in order, and logs each attempt. Wrong guesses fail safely during gas
// estimation (before any wallet prompt or gas spend) — the first one that succeeds wins.
// If NONE of them work, paste your contract's ABI (thirdweb dashboard -> your contract
// -> Code tab -> ABI) and the exact function name/params can be hardcoded directly.

import { BrowserProvider, Contract } from "https://esm.sh/ethers@6.13.4";

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614n;
const ARBITRUM_SEPOLIA_HEX = "0x66eee";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function buildTokenURI(score, total) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#0a0713"/>
    <text x="200" y="170" fill="#a78bfa" font-size="34" text-anchor="middle" font-family="monospace">FHENIX</text>
    <text x="200" y="215" fill="#38bdf8" font-size="22" text-anchor="middle" font-family="monospace">PRIVACY QUIZ</text>
    <text x="200" y="250" fill="#8f86b3" font-size="18" text-anchor="middle" font-family="monospace">SOULBOUND BADGE</text>
    <text x="200" y="300" fill="#efeaff" font-size="26" text-anchor="middle" font-family="monospace">${score} / ${total}</text>
  </svg>`;
  const svgB64 = btoa(unescape(encodeURIComponent(svg)));
  const metadata = {
    name: `Fhenix Privacy Quiz Badge — ${score}/${total}`,
    description: "Soulbound badge for completing the Fhenix Privacy Quiz & CoFHE demo.",
    image: `data:image/svg+xml;base64,${svgB64}`,
  };
  const metaB64 = btoa(unescape(encodeURIComponent(JSON.stringify(metadata))));
  return `data:application/json;base64,${metaB64}`;
}

function shortErr(err) {
  return String(err?.shortMessage || err?.reason || err?.info?.error?.message || err?.message || err).slice(0, 140);
}

async function mintBadgeOnchain(score, log = () => {}) {
  if (typeof window.ethereum === "undefined") {
    throw new Error("No wallet found. Install MetaMask or open this page in a wallet browser.");
  }
  const badgeAddress = window.BADGE_ADDRESS;
  if (!badgeAddress) {
    throw new Error("window.BADGE_ADDRESS is not set.");
  }

  const provider = new BrowserProvider(window.ethereum);

  const network = await provider.getNetwork();
  if (network.chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
    log("Switching to Arbitrum Sepolia...");
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARBITRUM_SEPOLIA_HEX }] });
  }

  const signer = await provider.getSigner();
  const me = await signer.getAddress();

  log("Checking wallet for an existing badge...");
  const balContract = new Contract(badgeAddress, ["function balanceOf(address owner) view returns (uint256)"], provider);
  const bal = await balContract.balanceOf(me).catch(() => 0n);
  if (bal > 0n) {
    throw new Error("This wallet already owns a badge. Soulbound badges are one per wallet — check your wallet's NFTs tab.");
  }

  const total = 20;
  const uri = buildTokenURI(score, total);

  // Tried in order. Each one fails safely (no wallet prompt, no gas spent) during
  // gas estimation if the function doesn't exist on your contract, so it's safe to
  // let this list run through candidates.
  const candidates = [
    { label: "mintTo(address,string)", fn: "mintTo", abi: "function mintTo(address to, string uri) returns (uint256)", args: [me, uri] },
    { label: "claim(address,uint256)", fn: "claim", abi: "function claim(address receiver, uint256 quantity) payable", args: [me, 1n] },
    { label: "mint(address,string)", fn: "mint", abi: "function mint(address to, string uri) returns (uint256)", args: [me, uri] },
    { label: "safeMint(address,string)", fn: "safeMint", abi: "function safeMint(address to, string uri) returns (uint256)", args: [me, uri] },
    { label: "mint(address)", fn: "mint", abi: "function mint(address to) returns (uint256)", args: [me] },
    { label: "safeMint(address)", fn: "safeMint", abi: "function safeMint(address to) returns (uint256)", args: [me] },
    { label: "mint()", fn: "mint", abi: "function mint() returns (uint256)", args: [] },
  ];

  let receipt = null;
  let lastErr = null;
  for (const c of candidates) {
    try {
      log(`Trying ${c.label}...`);
      const contract = new Contract(badgeAddress, [c.abi], signer);
      const tx = await contract[c.fn](...c.args);
      log("Transaction sent, waiting for confirmation...");
      receipt = await tx.wait();
      break;
    } catch (err) {
      lastErr = err;
      log(`${c.label} not usable (${shortErr(err)})`);
    }
  }

  if (!receipt) {
    throw new Error(
      "None of the standard mint functions matched this contract. Open the thirdweb dashboard -> " +
      "your contract -> Code tab -> ABI, and share the exact write function name/params so it can be " +
      "called directly. Last error: " + shortErr(lastErr)
    );
  }

  const transferLog = (receipt.logs || []).find(
    (l) => l.address?.toLowerCase() === badgeAddress.toLowerCase() && l.topics?.[0] === TRANSFER_TOPIC && l.topics.length === 4
  );
  const tokenId = transferLog ? BigInt(transferLog.topics[3]).toString() : null;

  return { tx: receipt.hash, tokenId };
}

window.mintBadgeOnchain = mintBadgeOnchain;

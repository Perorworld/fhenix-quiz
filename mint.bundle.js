// mint.js — mints the Fhenix Quiz Soulbound Badge on the thirdweb ERC-721 contract.
//
// This REPLACES the old mint.bundle.js. That file called a bespoke function,
// mintBadge(bytes32 encryptedScore, bytes signature), which only exists on the
// previous custom CoFHE-encrypted-score contract. Your new thirdweb contract
// (window.BADGE_ADDRESS) does not have that function, so the old bundle would
// have reverted on every mint. This module talks to the new contract instead,
// using thirdweb's official v5 SDK, and exposes the same window.mintBadgeOnchain(score, log)
// entry point that index.html already calls — so nothing else in index.html needs to change.
//
// SETUP CHECKLIST (read this before testing):
// 1. In index.html, set window.THIRDWEB_CLIENT_ID (thirdweb dashboard -> Settings -> API Keys).
// 2. On that same API key, add this site's domain under "Allowed Domains"
//    (and http://localhost:PORT while you test locally) — otherwise every call below
//    will be silently rejected by thirdweb's edge.
// 3. On the thirdweb dashboard, open your contract and check which minting path it supports:
//      - "NFT Drop" (Claimable): you set claim conditions (public, price 0, max 1 per wallet).
//        This script's primary path (claimTo) is for this case.
//      - "NFT Collection" (Mintable) or a custom contract: minting is normally restricted to
//        an address holding MINTER_ROLE — a random visitor's wallet CANNOT call mintTo unless
//        you've explicitly granted that role publicly. This script's fallback path (mintTo)
//        only works if minting has been opened up, or if you swap `account` below for a
//        backend relayer wallet. If neither path works, hundreds of strangers cannot self-mint
//        from the frontend — you'd need a small backend endpoint holding MINTER_ROLE instead.
// 4. Confirm the contract is actually soulbound (non-transferable) on the dashboard — thirdweb's
//    "Soulbound" extension is opt-in, this script doesn't enforce it.

import { createThirdwebClient, getContract, sendTransaction, waitForReceipt } from "https://esm.sh/thirdweb@5";
import { defineChain } from "https://esm.sh/thirdweb@5/chains";
import { EIP1193 } from "https://esm.sh/thirdweb@5/wallets";
import { claimTo, mintTo, balanceOf } from "https://esm.sh/thirdweb@5/extensions/erc721";

const ARBITRUM_SEPOLIA = defineChain(421614);
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function buildBadgeSvgFile(score, total) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#0a0713"/>
    <text x="200" y="170" fill="#a78bfa" font-size="34" text-anchor="middle" font-family="monospace">FHENIX</text>
    <text x="200" y="215" fill="#38bdf8" font-size="22" text-anchor="middle" font-family="monospace">PRIVACY QUIZ</text>
    <text x="200" y="250" fill="#8f86b3" font-size="18" text-anchor="middle" font-family="monospace">SOULBOUND BADGE</text>
    <text x="200" y="300" fill="#efeaff" font-size="26" text-anchor="middle" font-family="monospace">${score} / ${total}</text>
  </svg>`;
  return new File([svg], "badge.svg", { type: "image/svg+xml" });
}

async function mintBadgeOnchain(score, log = () => {}) {
  if (typeof window.ethereum === "undefined") {
    throw new Error("No wallet found. Install MetaMask or open this page in a wallet browser.");
  }
  const clientId = window.THIRDWEB_CLIENT_ID;
  if (!clientId || clientId.includes("PASTE_YOUR")) {
    throw new Error("Missing thirdweb Client ID. Set window.THIRDWEB_CLIENT_ID in index.html.");
  }
  const badgeAddress = window.BADGE_ADDRESS;
  if (!badgeAddress) {
    throw new Error("window.BADGE_ADDRESS is not set.");
  }

  const client = createThirdwebClient({ clientId });
  const contract = getContract({ client, chain: ARBITRUM_SEPOLIA, address: badgeAddress });

  log("Connecting wallet...");
  const wallet = EIP1193.fromProvider({ provider: window.ethereum });
  const account = await wallet.connect({ client });

  log("Checking wallet for an existing badge...");
  const existing = await balanceOf({ contract, owner: account.address }).catch(() => 0n);
  if (existing > 0n) {
    throw new Error("This wallet already owns a badge. Soulbound badges are one per wallet — check your wallet's NFTs tab.");
  }

  const total = 20;
  let receipt;

  log("Requesting your badge (public claim)...");
  try {
    const transaction = claimTo({ contract, to: account.address, quantity: 1n });
    const { transactionHash } = await sendTransaction({ transaction, account });
    log("Waiting for confirmation...");
    receipt = await waitForReceipt({ client, chain: ARBITRUM_SEPOLIA, transactionHash });
  } catch (claimErr) {
    log("Public claim unavailable (" + String(claimErr?.shortMessage || claimErr?.message || claimErr).slice(0, 140) + "). Trying direct mint...");
    try {
      const nftFile = buildBadgeSvgFile(score, total);
      const transaction = mintTo({
        contract,
        to: account.address,
        nft: {
          name: `Fhenix Privacy Quiz Badge — ${score}/${total}`,
          description: "Soulbound badge for completing the Fhenix Privacy Quiz & CoFHE demo.",
          image: nftFile,
        },
      });
      const { transactionHash } = await sendTransaction({ transaction, account });
      log("Waiting for confirmation...");
      receipt = await waitForReceipt({ client, chain: ARBITRUM_SEPOLIA, transactionHash });
    } catch (mintErr) {
      throw new Error(
        "Mint failed on both the public-claim and direct-mint paths. This wallet may not be permitted to mint " +
        "(check claim conditions or MINTER_ROLE on the thirdweb dashboard). Details: " +
        String(mintErr?.shortMessage || mintErr?.message || mintErr).slice(0, 200)
      );
    }
  }

  const transferLog = (receipt.logs || []).find(
    (l) => l.address?.toLowerCase() === badgeAddress.toLowerCase() && l.topics?.[0] === TRANSFER_TOPIC && l.topics.length === 4
  );
  const tokenId = transferLog ? BigInt(transferLog.topics[3]).toString() : null;

  return { tx: receipt.transactionHash, tokenId };
}

window.mintBadgeOnchain = mintBadgeOnchain;

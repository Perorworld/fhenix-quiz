# Fhenix Privacy Quiz badge: Quiz Master Award trophy + encrypted score

## What changed
- The badge artwork is now the "Quiz Master Award" trophy image (trophy.jpg), for every minter.
- The score stays encrypted onchain (FHE), same as before. This needs the CoFHE contract, not the
  thirdweb prebuilt NFT contract — thirdweb's generic templates cannot hold an FHE ciphertext.
- mint.bundle.js (the CoFHE-encrypting mint script) replaces mint.js.

## 1. Upload the trophy image
Upload trophy.jpg to the root of your repo, next to index.html (same folder as logo.png).
Once deployed it will live at: https://YOUR-SITE/trophy.jpg

## 2. Deploy the contract (Remix, Arbitrum Sepolia)
1. Paste contracts/FhenixQuizSBT.sol into Remix. Solidity 0.8.28, EVM version "cancun".
2. Deploy tab > constructor field "badgeImageURI" > type your trophy image's full URL,
   e.g. https://fhenix-quiz.vercel.app/trophy.jpg  (must be the real https address once
   your site is live — not a placeholder, or badges will show a broken image).
3. Deploy with your wallet on Arbitrum Sepolia. Copy the new contract address.
   (The previous address no longer works — this contract's constructor changed.)

## 3. Update index.html
Paste the new address into window.BADGE_ADDRESS near the top of the script.

## 4. Re-upload to GitHub
index.html, trophy.jpg, mint.bundle.js, tfhe_bg.wasm, contracts/FhenixQuizSBT.sol.
Everything else (leaderboard, share card, wallet connect) is unchanged.

## 5. Test
Play the quiz, mint, then open the badge in your wallet's NFT tab or on
https://sepolia.arbiscan.io/token/YOUR_CONTRACT to confirm the trophy image shows.

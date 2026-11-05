---
status: approved
---

# Design brief: Beauty Scan (working title, default)

<!-- Rewritten after the learner's feedback: no virtual shelf. The Lens scans REAL products with the camera. -->

## The one spatial moment
I'm in the supermarket, in front of the beauty-products shelf, with a real product in my hand. I look at it and pinch to scan. The glasses' camera reads its barcode and label, and right next to the product I see a Yuka-style verdict: a score from 0 to 100 with a color (green = excellent, yellow/orange = so-so, red = bad), the problem ingredients it contains (heavy metals, skin allergens, irritants, endocrine disruptors), which reactions it can cause for sensitive skin, and a better alternative when the score is bad.

## Why it belongs on glasses
- Uses: shares your view (the camera sees the product I'm holding), draws in the world (the verdict sits next to the product), leaves your body free (no phone to take out; one hand holds the product, the other stays on the cart).
- Why it's better than the phone version: Yuka on the phone means product in one hand, phone in the other, eyes down at a screen. Here I just look at the product.

## Product or overlay
- Type: overlay — it responds to a real product, through the camera.
- What it senses: a camera frame of the product I'm looking at (Camera Module). No virtual stand-in.
- How the answer is built (real, not hard-coded):
  1. The camera frame is sent to the AI (Gemini, through the Remote Service Gateway). The AI reads the barcode digits, the brand and product name, and the ingredient list if it's visible on the package.
  2. With the barcode, the Lens looks the product up in **Open Beauty Facts** (a free, open database of cosmetics, with real ingredient lists).
  3. The AI analyzes the ingredient list (from the database, or read from the package) and returns the score, the tagged problem ingredients, the sensitive-skin explanation and one better alternative.
  4. If nothing gives an ingredient list, the AI answers from what it knows about the product and the card says "Estimated — ingredient list not found".
- In the Lens Studio preview: the camera feed comes from the computer's webcam, so I can hold a real product up to the webcam and scan it. (To verify first in the build.)

## Where things live
- Where the user is looking during the main task: at the product in their hand, about 30–40 cm away, a little below eye level.
- Scan frame: a thin rounded square in the center of view, about 40 cm away, showing where to hold the product; with the hint "Look at the product and pinch to scan" (default).
- SCAN button: big, just below the scan frame, as an alternative to the pinch (default).
- While scanning: the frame pulses and a "Reading the product…" label shows, with a beep (default).
- Result card: beside the product (to the left), about 45 cm away, about 15 × 22 cm, light text on a readable panel, facing the user (default). It contains:
  - product name and brand, and the barcode number read;
  - a large score 0–100 in a colored circle, with the word Excellent / Good / Mediocre / Bad;
  - the problem ingredients, each tagged (heavy metal / skin allergen / irritant / endocrine disruptor), with a colored dot by risk level;
  - which skin reactions it can cause for sensitive skin, in one or two plain sentences;
  - "Better alternative:" one product suggestion, only when the score is below 50;
  - where the data came from (Open Beauty Facts / read from the package / estimated);
  - a small line: "Informational only, not medical advice" (default).
- CLOSE button on the card; closing brings back the scan frame for the next product (default).

## Hands and input
- Scan: pinch (either hand) while looking at the product, or press SCAN.
- Close the result: press CLOSE.
- Targets are big and highlight when aimed at.
- Voice: none.

## When things show
- Scan frame and SCAN button: whenever no result is showing.
- "Reading the product…": from the pinch until the answer arrives.
- Result card: when the answer arrives; hides on CLOSE.
- If the AI can't see a product or a barcode: a short message "I couldn't read the product — hold it closer, with the label facing you" and the scan frame comes back. No made-up data.
- If the AI or the network fails: "No connection — try again" (default).

## Done criteria
Each one can be checked in Lens Studio's preview, holding a real product up to the webcam.
1. The scan frame, the hint and the SCAN button appear in front of me; the live camera feed is running.
2. Pinching (or pressing SCAN) captures a camera frame, shows "Reading the product…", and sends it to the AI.
3. With a real beauty product in view, a result card appears with the product name, a 0–100 score with the right color, and a list of problem ingredients, each tagged.
4. The card explains which reactions it can cause for sensitive skin, shows a better alternative when the score is below 50, and says where the data came from.
5. Pressing CLOSE hides the card and brings back the scan frame; scanning a different product gives a different result. With no product in view, the "couldn't read" message shows instead of a card.

## Out of scope
- A personal allergy profile, history of scanned products, shopping lists, food products.
- Continuous auto-scan without a pinch (scan only on request, to save battery and data).

## Risks and open questions
- The preview webcam feed must reach the Camera Module; verify first. If it doesn't, the demo video must be recorded on real glasses.
- AI reading of small barcodes from a camera frame may fail; the label and the ingredient list are the backup.
- Open Beauty Facts doesn't have every product, especially local brands; then the AI reads the package or estimates, and the card says so.
- AI answers can be wrong; the card always shows the data source and the "not medical advice" line.
- Camera + internet triggers Transparent Permission on device (the user sees a permission prompt; the LED blinks). That's allowed for publishing.
- Health information: general and informational only, not medical advice.
- The learner wants to try it later on their Spectacles (2024), which use Lens Studio 5.15. That's a separate port after the hackathon build.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Remove the previous virtual-shelf build completely: the shelf, the 4 generated product meshes, the hard-coded product data, and their scripts and tests. Keep only what's still useful (sounds, icons, the AI helper if it fits).
- Camera: Camera Module, `Default_Color` in the editor; capture the current frame on pinch/SCAN, encode it, and send it to Gemini (multimodal input) through the Remote Service Gateway. Ask for a strict JSON answer.
- Database: Open Beauty Facts product lookup by barcode, through the Internet Module.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Keep text light and readable.
- Get the basic flow working first (camera → AI → card), then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Tests may feed a saved product photo instead of the live camera. Say which criteria have no test.
- Don't record, store, identify, or follow people. Send the camera frame only when the user scans, and don't keep it.

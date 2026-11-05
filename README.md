# InciSee — see what's inside your cosmetics, right on the product

A Lens for **SPECS** (Snap's AR glasses), built for the *Learn AR with SPECS* Devpost hackathon.

Look at a beauty product on the shelf and pinch. InciSee reads the barcode and the label through the glasses' camera, finds the product's **real ingredient list**, and puts a verdict card right next to the product. The card shows:

- a 0–100 score and its colour;
- the problem ingredients, each tagged as an allergen, irritant, heavy metal or endocrine disruptor;
- what the product can do to sensitive skin;
- a better alternative.

You don't need to take out a phone, and both hands stay free.

## Who it's for
People with sensitive or reactive skin, allergies, or who simply want to know what they put on their body. Today they stand in the aisle with a product in one hand and a phone app in the other. With InciSee they just look at the product.

## How it works
1. **Pick a language.** The options are Español, English, Français, Deutsch and 日本語. The whole UI and the AI text follow the choice.
2. **Scan.**
   - Pinch with either hand, or press **SCAN**. If the barcode is too small to read, press **CODE** and type it on the AR number pad.
   - The scan frame follows your gaze, so it sits over the product you're holding.
3. **Read.** Gemini, called through the Remote Service Gateway, reads the barcode digits, the brand, the name and any ingredient list printed on the package.
   - Barcodes are validated with their GTIN check digit.
   - If the check fails, the Lens crops and enhances the barcode area and reads it again.
4. **Find real data.** No ingredient list is ever made up. The sources are tried in order:
   - Open Beauty Facts by barcode;
   - the list printed on the package;
   - Open Beauty Facts by name;
   - INCIDecoder;
   - UPCitemdb, to name the product when only the barcode is known.

   If nothing is found, the Lens says so honestly. Accessories with no ingredient list, such as press-on nails or lashes, are recognised as not cosmetics.
5. **Score with fixed rules.** The score comes from a rule table, not from the AI, so the same product always gets the same score. The table is based on:
   - EU Cosmetics Regulation 1223/2009;
   - the 26 fragrance allergens;
   - SCCS opinions;
   - the EU endocrine-disruptor lists.

   Gemini only writes the plain-language sensitive-skin explanation and the alternative.
6. **Show the card.** The card appears beside the product and lazily follows your view. You can grab it and move it. Press **CLOSE** to scan the next product.

Results are cached on the device, so re-scanning a product is instant and consistent. Camera frames are encoded only when you scan, and they are never stored.

## Built with
- Lens Studio 5.23, TypeScript.
- Built by a coding agent (Claude Code) through Snap's **CLAD** plugin and the **Lens Studio MCP**.
- Tested with **LEAF** scenarios (`Assets/Tests`).
- Packages: Spectacles Interaction Kit, Spectacles UI Kit, Remote Service Gateway (Gemini).
- Planned with the Devpost Learn skill pack. The design brief is in [`devpost/design-brief.md`](devpost/design-brief.md).

## Project layout
- `Assets/Scripts/`:
  - `BeautyScan.ts`: main flow, follow behaviour, keyboard.
  - `BeautyScanUI.ts`: InciSee UI.
  - `BeautyScanPipeline.ts`: data sources.
  - `BeautyScanRules.ts`: scoring rules.
  - `BeautyScanAI.ts`: Gemini calls.
  - `BeautyScanCamera.ts`: capture and barcode close-up.
  - `BeautyScanOBF.ts`, `BeautyScanInci.ts`, `BeautyScanUPC.ts`: lookups.
  - `BeautyScanI18n.ts`: the 5 languages.
- `Assets/Icons/`: InciSee brand assets.
- `Assets/Tests/`: LEAF test scenarios.

## Running it
1. Open `TrickOrTreatRush.esproj` in Lens Studio 5.23.
2. Paste your own Google token in **Window → Remote Service Gateway Token**. The tokens are stripped from this repo.
3. In the preview, hold a real product up to the webcam and pinch, or press SCAN.

*Informational only. This is not medical advice.*

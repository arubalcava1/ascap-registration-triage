# ASCAP Registration Triage Extension

Chrome extension for reviewing ASCAP public repertoire matches directly in Chrome.

This is an independent workflow helper. It is not affiliated with, endorsed by, or operated by ASCAP.

The extension helps you enter ASCAP work metadata, open ASCAP public repertoire searches, capture visible ASCAP result records, analyze likely matches, compare advisory public songwriter reference evidence, and copy the ASCAP Work ID or review report. It does not require a local backend to run.

## Load The Extension

1. Open Chrome.
2. Go to:

   ```text
   chrome://extensions
   ```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this `extension` folder.

After changing extension files, go back to `chrome://extensions` and click **Reload** on the extension card.

## Current Workflow

1. Open the extension popup.
2. Enter the ASCAP work metadata under review.
3. Click **Open ASCAP searches**.
4. If needed, click **Fill ASCAP search** on the ASCAP public repertoire page.
5. Review the filled ASCAP fields and run the ASCAP search manually.
6. While viewing ASCAP public results, click **Capture and analyze**.
7. Review captured candidates.
8. Remove any bad capture if needed.
9. Review ranked results and public writer-reference alignment.
10. Copy the likely ASCAP Work ID or open/copy the optional report.

## What The Extension Shows

- Local Chrome status
- Work under review fields
- ASCAP search opening and field-filling actions
- Captured ASCAP candidate options
- Ranked match labels
- Public writer-reference alignment or mismatch
- Per-result ASCAP Work ID copy button
- Optional copyable report
- Theme choices

## Public Writer Reference

The extension can query public music metadata sources, such as MusicBrainz, Wikidata, and Wikipedia, to find advisory songwriter reference data for the work under review.

This helps identify cases where two ASCAP results have the same title but different writer sets. A candidate that aligns with the public reference writer set can rank higher; a candidate missing expected writers or containing unrelated extra writers is flagged for review. If public metadata cannot produce a reliable writer set, the extension falls back to comparing captured ASCAP candidate writer sets against the user-entered writer context.

This is advisory metadata only. It is not an official ASCAP determination.

## Troubleshooting

- Capture finds nothing: wait for ASCAP results to finish loading, scroll near the result cards, then retry.
- Capture warns you about the page: confirm you are viewing ASCAP public repertoire results and try again after the page finishes loading.
- Public writer reference is not found: continue reviewing the ASCAP candidates; the extension will still rank from captured ASCAP metadata.
- Results look stale after code changes: reload the unpacked extension in `chrome://extensions`.

## Pre-Publish Checklist

Run from the repo root:

```powershell
node --check extension\popup.js
```

Then manually reload the extension and test one ASCAP capture/analyze flow.

## Chrome Web Store Prep

See:

- `STORE_LISTING.md` for listing copy and permission rationale.
- `PRIVACY.md` for a plain-language privacy statement.
- `PACKAGING.md` for preflight checks and zip instructions.

## Guardrails

- Captures only visible public page text from the active ASCAP tab.
- Uses public ASCAP repertoire pages only.
- Does not store credentials.
- Does not bypass CAPTCHA, login, or access restrictions.
- Does not use hidden ASCAP endpoints.
- Does not scrape arbitrary sites for songwriter credits.
- Uses public metadata APIs only as advisory reference evidence.

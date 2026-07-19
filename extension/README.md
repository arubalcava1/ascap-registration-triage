# ASCAP Registration Triage Extension

Chrome extension MVP for reviewing ASCAP public repertoire matches with a local FastAPI triage backend.

The extension helps you enter ASCAP work metadata, open ASCAP public repertoire searches, capture visible ASCAP result records, analyze likely matches, compare public songwriter reference evidence, and copy the ASCAP Work ID or review report.

## Start Locally

From the repo root:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The backend must be available at:

```text
http://127.0.0.1:8000
```

The popup shows `Backend connected` when `/health` is reachable.

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

## Current MVP Flow

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

- Backend connection status
- Work under review fields
- ASCAP search plan based on the strongest field entered
- ASCAP search opening and field-filling actions
- Captured ASCAP candidate options
- Ranked match results
- Public writer-reference alignment or mismatch
- Per-result ASCAP Work ID copy button
- Optional copyable report

## Public Writer Reference

The backend may use public music metadata APIs, such as MusicBrainz and Wikidata/Wikipedia, to find advisory songwriter reference data for the work under review.

This helps the ranking engine identify cases where two ASCAP results have the same title but different writer sets. A candidate that aligns with the public reference writer set can rank higher; a candidate missing expected writers or containing unrelated extra writers is flagged for review.

This is advisory metadata only. It is not an official ASCAP determination.

## Troubleshooting

- `Backend not running`: start FastAPI with the command above.
- Capture finds nothing: wait for ASCAP results to finish loading, scroll near the result cards, then retry.
- Capture warns you about the page: confirm you are viewing ASCAP public repertoire results and try again after the page finishes loading.
- Results look stale after code changes: reload the unpacked extension in `chrome://extensions`.
- Backend changes are not reflected: stop and restart `uvicorn`.

## Pre-Commit Checklist

Run from the repo root unless noted:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest
```

```powershell
cd ..
node --check extension\popup.js
```

Then manually reload the extension and test one ASCAP capture/analyze flow.

## Guardrails

- Captures only visible public page text from the active ASCAP tab.
- Uses public ASCAP repertoire pages only.
- Does not store credentials.
- Does not bypass CAPTCHA, login, or access restrictions.
- Does not use hidden ASCAP endpoints.
- Does not scrape arbitrary sites for songwriter credits.
- Reuses the backend parser and analyzer instead of creating a separate extension-only scoring path.

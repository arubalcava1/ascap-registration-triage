# ASCAP Registration Triage Extension

Chrome extension MVP for capturing visible ASCAP public repertoire results and sending them to the local FastAPI triage backend.

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
9. Review ranked results and copy the report.

## Troubleshooting

- `Backend not running`: start FastAPI with the command above.
- Capture finds nothing: wait for ASCAP results to finish loading, scroll near the result cards, then retry.
- Parse fails on a specific result: the popup will name the captured result number that failed.
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
- Reuses the backend parser and analyzer instead of creating a separate extension-only scoring path.

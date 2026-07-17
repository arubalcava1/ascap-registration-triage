# ASCAP Registration Triage Extension

Chrome extension MVP for capturing visible ASCAP public repertoire page text and sending it to the local FastAPI triage backend.

## Local Setup

1. Start the backend:

   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   python -m uvicorn app.main:app --reload
   ```

2. Open Chrome extensions:

   ```text
   chrome://extensions
   ```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this `extension` folder.

## Current MVP Flow

1. Open a public ASCAP repertoire result page.
2. Open the extension popup.
3. Enter the ASCAP work metadata under review.
4. Use **Open ASCAP** to open the public ASCAP repertory search.
5. On the ASCAP public source tab, use **Fill ASCAP search** to populate visible search fields from the saved metadata.
6. Review the filled fields and click the public site's search button yourself.
7. Click **Capture and analyze** while viewing ASCAP public results.
8. The extension expands visible ASCAP results, captures each work separately, sends them to the parser, and runs analysis.
9. Review the ranked results and generated report.

## Guardrails

- Captures only visible public page text from the active ASCAP tab.
- Uses public ASCAP repertoire pages only.
- Does not store credentials.
- Does not bypass CAPTCHA, login, or access restrictions.
- Reuses the backend parser and analyzer instead of creating a separate extension-only scoring path.

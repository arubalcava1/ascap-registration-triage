# ASCAP Registration Triage

ASCAP Registration Triage is an independent Chrome extension and local FastAPI backend for reviewing possible ASCAP public repertoire matches.

The tool helps a user enter ASCAP work metadata, open the ASCAP public repertoire search, capture visible ASCAP public result data, rank likely matching works, highlight metadata differences, and generate a copyable review report.

It is not an official ASCAP product. It does not access ASCAP private systems, determine legal ownership, calculate royalties, or fix registrations.

## Current Direction

This project is now **extension-first**.

The main product is a Chrome extension that works alongside ASCAP public repertoire pages. The earlier web dashboard remains in the repo as prototype work, but the active workflow is the extension plus the local backend.

The current focus is ASCAP public repertoire matching. BMI-specific workflows have been removed from the extension because the main use case is reviewing possible matches that matter to ASCAP work registration triage.

## What It Does

1. The user enters the ASCAP work metadata they are checking.
2. The extension opens ASCAP public repertoire search.
3. The user reviews/runs the public ASCAP search.
4. The extension captures visible ASCAP public result blocks from the active tab.
5. The backend parses captured result text into candidate work records.
6. The backend normalizes and compares title, writers, publishers, shares, ISWC, and ASCAP work IDs.
7. The extension shows ranked results with explanations.
8. The user can copy an ASCAP-focused possible match review report.

## Matching Priorities

The current matching engine is intentionally conservative and explainable.

Primary match signals:

- Work title similarity
- Writer name overlap
- Writer last-name-only support
- Writer set quality, including missing or extra writers

Secondary match signals:

- Publisher similarity
- Share comparison when shares are provided
- ISWC comparison only when the user provides an ISWC
- ASCAP song code / public Work ID comparison only when the user provides a song code

If the user does not provide an ISWC or ASCAP song code, those fields are ignored as matching criteria.

## Current Features

- Chrome Manifest V3 extension
- ASCAP-only search workflow
- Local backend health status in the extension
- ASCAP public search opening and field filling
- Visible public result capture from the active ASCAP tab
- Automatic result expansion/capture attempts
- Candidate parsing from ASCAP result text
- Per-candidate removal
- Capture diagnostics and recovery notes
- Ranked candidate analysis
- Writer-first match explanations
- Copyable ASCAP possible match report
- FastAPI backend with automated tests

## Guardrails

ASCAP Registration Triage:

- Captures only visible public ASCAP page text
- Does not store ASCAP credentials
- Does not automate private ASCAP Member Access actions
- Does not bypass CAPTCHA, login walls, disclaimers, or access restrictions
- Does not use hidden ASCAP endpoints
- Does not claim official ASCAP integration
- Does not make legal, royalty, or ownership determinations

The output is a triage signal for human review.

## Project Structure

```text
ascap-registration-triage/
|
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- schemas.py
|   |   |-- routes/
|   |   `-- services/
|   |-- tests/
|   `-- requirements.txt
|
|-- extension/
|   |-- manifest.json
|   |-- popup.html
|   |-- popup.css
|   |-- popup.js
|   |-- icons/
|   `-- README.md
|
|-- frontend/
|   `-- earlier web prototype
|
|-- docs/
`-- README.md
```

## Run Locally

### 1. Start The Backend

From the repo root:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The backend runs at:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

### 2. Load The Chrome Extension

1. Open Chrome.
2. Go to:

   ```text
   chrome://extensions
   ```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension/` folder.

After changing extension files, click **Reload** on the extension card in `chrome://extensions`.

## Basic Workflow

1. Start the backend.
2. Open the extension popup.
3. Enter the ASCAP work title and any known metadata.
4. Click **Open ASCAP searches**.
5. Run/review the ASCAP public search.
6. Click **Capture and analyze** while viewing ASCAP public results.
7. Review captured candidates.
8. Remove bad captures if needed.
9. Review ranked results.
10. Copy the report.

## Backend API

Core endpoints:

- `GET /health`
- `POST /api/parse-candidate`
- `POST /api/analyze`

The extension uses these endpoints locally.

## Testing

Backend tests:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest
```

Extension JavaScript syntax check:

```powershell
cd ..
node --check extension\popup.js
```

## Development Status

Current phase:

```text
Chrome Extension MVP
```

Completed or working:

- Backend matching engine
- ASCAP parser
- ASCAP-focused extension popup
- Search assist
- Capture and analyze flow
- Writer-first ranking explanations
- Copyable report
- Local run documentation

Current focus:

- Capture reliability on real ASCAP result pages
- Parser quality for messy ASCAP page text
- Result explanation clarity
- Extension install/use polish

Later possibilities:

- Better saved investigation handling
- Cleaner report export formats
- More robust ASCAP page pattern handling
- Packaged extension release

## Disclaimer

This project is for metadata triage and workflow assistance only. It is not affiliated with ASCAP and does not provide official registration, legal, ownership, royalty, or administrative determinations.

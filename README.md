# ASCAP Registration Triage

ASCAP Registration Triage is an independent Chrome extension for reviewing possible ASCAP public repertoire matches.

The extension helps a user enter ASCAP search clues, open ASCAP public repertoire searches, capture visible ASCAP result data, rank likely matching works, cross-check advisory public songwriter reference data, copy the likely ASCAP Work ID, and generate a copyable review report.

It is not an official ASCAP product. It does not access ASCAP private systems, determine legal ownership, calculate royalties, or fix registrations.

## Current Direction

This project is now **extension-first**.

The main product is a self-contained Chrome extension that works alongside ASCAP public repertoire pages. The earlier backend and web dashboard remain in the repo as prototype/development work, but normal extension use no longer requires a local backend, local server, Vite app, or Python environment.

The current focus is ASCAP public repertoire matching. BMI-specific workflows have been removed from the extension because the core use case is reviewing possible matches that matter to ASCAP work registration triage.

## What It Does

1. The user enters the ASCAP work metadata or search clues they are checking.
2. The extension opens ASCAP public repertoire search.
3. The user reviews/runs the public ASCAP search.
4. The extension captures visible ASCAP public result blocks from the active tab.
5. The extension parses captured result text into candidate work records.
6. The extension optionally checks public music metadata APIs for advisory songwriter reference data.
7. The extension normalizes and compares title, writers, publishers, ISWC, and ASCAP work IDs.
8. The extension shows ranked results with explanations and public writer-reference alignment.
9. The user can copy the chosen ASCAP Work ID or an ASCAP-focused possible match review report.

## Matching Priorities

The current matching engine is intentionally conservative and explainable.

Primary match signals:

- Work title similarity
- Writer name overlap
- Writer last-name-only support
- Writer set quality, including missing or extra writers

Secondary match signals:

- Publisher similarity
- ISWC comparison only when the user provides an ISWC
- ASCAP song code / public Work ID comparison only when the user provides a song code

If the user does not provide an ISWC or ASCAP song code, those fields are ignored as matching criteria.

Public writer-reference support:

- The extension can look up advisory songwriter reference data using documented/public metadata sources such as MusicBrainz, Wikidata, and Wikipedia.
- Public reference data is advisory evidence, not an official ASCAP determination.
- If a reliable reference writer set is found, candidates that align with the expected writers are boosted, while candidates missing expected writers or containing unrelated extra writers are flagged for review.
- If public metadata cannot produce a reliable writer set, the extension falls back to captured ASCAP candidate writers and the user-entered writer context.
- No raw broad web scraping, hidden ASCAP endpoints, credentialed access, or private portal automation is used for this reference step.

## Current Features

- Chrome Manifest V3 extension
- ASCAP-only search workflow
- Self-contained local analysis in Chrome
- ASCAP public search opening and field filling
- Visible public result capture from the active ASCAP tab
- Automatic result expansion/capture attempts
- Candidate parsing from ASCAP result text
- Per-candidate removal
- Recovery notes when capture needs attention
- Ranked candidate analysis
- Writer-first match explanations
- Public writer-reference evidence from public metadata APIs
- Public writer-reference alignment/mismatch callouts
- Copy button for ASCAP Work IDs in ranked results
- Copyable ASCAP possible match report
- Theme choices

## Guardrails

ASCAP Registration Triage:

- Captures only visible public ASCAP page text
- Does not store ASCAP credentials
- Does not automate private ASCAP Member Access actions
- Does not bypass CAPTCHA, login walls, disclaimers, or access restrictions
- Does not use hidden ASCAP endpoints
- Does not scrape arbitrary websites for songwriter credits
- Does not claim official ASCAP integration
- Does not make legal, royalty, or ownership determinations

The output is a triage signal for human review.

## Project Structure

```text
ascap-registration-triage/
|
|-- extension/
|   |-- manifest.json
|   |-- popup.html
|   |-- popup.css
|   |-- popup.js
|   |-- icons/
|   `-- README.md
|
|-- backend/
|   `-- earlier FastAPI prototype and tests
|
|-- frontend/
|   `-- earlier web prototype
|
|-- docs/
`-- README.md
```

## Load The Chrome Extension

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

1. Open the extension popup.
2. Enter the ASCAP work title and any known metadata.
3. Click **Open ASCAP searches**.
4. Run/review the ASCAP public search.
5. Click **Capture and analyze** while viewing ASCAP public results.
6. Review captured candidates.
7. Remove bad captures if needed.
8. Review ranked results.
9. Copy the likely ASCAP Work ID when useful.
10. Open or copy the optional report.

## Testing

Extension JavaScript syntax check:

```powershell
node --check extension\popup.js
```

Optional backend prototype tests:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest
```

## Packaging

See [extension/PACKAGING.md](extension/PACKAGING.md) for the Chrome Web Store packaging checklist.

## Development Status

Current phase:

```text
Chrome Extension MVP
```

Completed or working:

- ASCAP-focused extension popup
- Search assist
- Capture and analyze flow
- Writer-first ranking explanations
- Public writer-reference evidence
- ASCAP Work ID copy action
- Copyable report
- Local Chrome-only operation
- Chrome Web Store prep docs

Current focus:

- Capture reliability on real ASCAP result pages
- Parser quality for messy ASCAP page text
- Result explanation clarity
- Packaged extension release

Later possibilities:

- Better saved investigation handling
- Cleaner report export formats
- More robust ASCAP page pattern handling
- Optional hosted service if a future feature truly needs one

## Disclaimer

This project is for metadata triage and workflow assistance only. It is not affiliated with ASCAP and does not provide official registration, legal, ownership, royalty, or administrative determinations.

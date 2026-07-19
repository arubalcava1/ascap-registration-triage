# Packaging Checklist

Use this checklist before creating a Chrome extension zip.

## Preflight

From the repo root:

```powershell
node --check extension\popup.js
```

Optional, if backend code was edited for development/reference tests:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest
cd ..
```

## Manual Acceptance Test

1. Open `chrome://extensions`.
2. Reload the unpacked extension.
3. Confirm the popup says `Runs in Chrome`.
4. Enter a test ASCAP work title and writer.
5. Click `Open ASCAP searches`.
6. Confirm ASCAP opens to the expected public search URL.
7. Click `Fill ASCAP search` on an ASCAP search page if the fields need help.
8. Run the ASCAP search manually.
9. Click `Capture and analyze` on the results page.
10. Confirm candidates appear.
11. Confirm ranked results appear.
12. Confirm `Copy ID` copies the ASCAP Work ID.
13. Confirm `Show report` opens the optional report and `Copy report` works.
14. Switch each theme and reopen the popup to confirm the theme persists.

## Build The Zip

Package only the `extension` folder contents, not the repo root.

In PowerShell from the repo root:

```powershell
Compress-Archive -Path extension\* -DestinationPath ascap-registration-triage-extension.zip -Force
```

Upload `ascap-registration-triage-extension.zip` to the Chrome Web Store developer dashboard.

## Publish Notes

The published extension is self-contained and does not require users to run Python, FastAPI, Vite, or a local backend.

The extension needs internet access for ASCAP public repertoire pages and optional public metadata reference lookups from MusicBrainz, Wikidata, and Wikipedia.

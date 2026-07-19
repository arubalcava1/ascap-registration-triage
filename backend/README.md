# ASCAP Registration Triage Backend

Local FastAPI backend for the ASCAP Registration Triage Chrome extension.

This service parses visible ASCAP public repertoire text, compares one ASCAP work record against one or more ASCAP public candidate records, optionally looks up public songwriter reference data, scores candidates, detects discrepancies, and returns ranked triage results for the extension.

It does not use a database, authentication, private ASCAP access, or official ASCAP integration.

## Current Role

The active product is extension-first. The Chrome extension handles the browser workflow; this backend provides the local parser and analysis engine.

Core responsibilities:

* Parse visible ASCAP public repertoire result text.
* Normalize titles, writers, publishers, ISWC values, and ASCAP Work IDs.
* Rank candidate ASCAP works against the work under review.
* Ignore ISWC / ASCAP song code as match criteria unless the user provides those fields.
* Use writer names as the strongest signal, including last-name-only input support.
* Use public music metadata APIs, such as MusicBrainz and Wikidata/Wikipedia, as advisory songwriter reference evidence.
* Generate conservative review decisions and copyable reports.

## Setup

From the repository root:

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Run Locally

```powershell
python -m uvicorn app.main:app --reload
```

Open the interactive API docs:

```text
http://127.0.0.1:8000/docs
```

Health check:

```text
GET http://127.0.0.1:8000/health
```

## Analyze Endpoint

```text
POST http://127.0.0.1:8000/api/analyze
```

The request body should include:

* `ascap_work`: ASCAP work metadata entered in the extension.
* `candidates`: one or more captured ASCAP public repertoire candidate records.

A sample request is available at:

```text
backend/examples/analyze_request.json
```

## Run Tests

```powershell
python -m pytest
```

Warnings from FastAPI or Starlette on Python 3.14 may appear and can be ignored if tests pass.

## API Surface

```text
GET /health
POST /api/parse-candidate
POST /api/analyze
```

`/api/parse-candidate` converts captured ASCAP result text into editable candidate metadata.

`/api/analyze` returns:

* ranked candidate results
* confidence labels
* matching evidence
* discrepancy items
* optional external writer reference evidence
* a conservative review decision
* a copyable report

## Public Writer Reference

The backend can look up public songwriter reference data for the searched work using documented/public metadata sources. This currently favors music metadata APIs over raw page scraping.

Important boundaries:

* Public writer reference data is advisory evidence only.
* The reference lookup does not replace ASCAP review.
* No credentials are stored.
* No private ASCAP Member Access pages are automated.
* No hidden ASCAP endpoints are used.
* No CAPTCHA, login wall, disclaimer, or access restriction is bypassed.

## Not Included

* Database storage
* Authentication
* Official ASCAP integration
* Legal ownership determination
* Royalty calculation
* Registration repair or automatic ASCAP submission

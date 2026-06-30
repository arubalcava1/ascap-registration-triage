# ASCAP Registration Triage Backend

Backend-only FastAPI MVP for ASCAP Registration Triage.

This service exposes a stateless analysis endpoint that compares one ASCAP work record against one or more public repertoire candidate records. It normalizes metadata, scores candidates, detects discrepancies, and returns ranked triage results.

It does not use a database, authentication, frontend, or Chrome extension.

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

* `ascap_work`: ASCAP portal work metadata.
* `candidates`: one or more public repertoire candidate records.

A sample request is available at:

```text
backend/examples/analyze_request.json
```

## Run Tests

```powershell
python -m pytest
```

Expected result:

```text
4 passed
```

Warnings from FastAPI or Starlette on Python 3.14 may appear and can be ignored for this milestone.

## Milestone 1 Scope

Included:

* Pydantic request and response schemas
* Metadata normalization
* Rule-based candidate scoring
* Ranked candidate results
* Field-level discrepancy detection
* Neutral disclaimer language
* Sample request payload
* Endpoint tests

Not included yet:

* Database storage
* Authentication
* Frontend
* Chrome extension
* Official ASCAP integration
* Legal ownership determination

# ASCAP Registration Triage

**ASCAP Registration** Triage is an independent music rights metadata tool designed to help ASCAP members investigate unresolved, conflicting, or possible-match style work registration issues.

The tool helps users compare ASCAP portal work metadata against public repertoire records from sources such as Songview, ASCAP repertory, and BMI repertory. It ranks likely matching public works, highlights discrepancies in writers, publishers, ownership shares, titles, identifiers, and ISWC data, then generates a structured report for follow-up.

This project does **not** claim to know ASCAP’s internal matching logic, does **not** determine legal ownership, and does **not** fix registrations automatically. It is intended as a triage and reporting assistant for organizing user-provided and publicly available metadata.

# ASCAP Registration Triage

**ASCAP Registration Triage** is a music rights metadata triage tool designed to help ASCAP members investigate unresolved or possible-match work registration issues by comparing ASCAP portal metadata against public repertoire data from sources such as Songview, ASCAP repertory, and BMI repertory.

The goal is not to replace ASCAP, BMI, Songview, or any official registration system. Instead, this project helps songwriters, publishers, and catalog administrators organize the manual investigation process by identifying likely matching public work records, highlighting metadata discrepancies, and generating a clear report for follow-up.

---

## Problem

Music work registrations can become difficult to resolve when metadata does not clearly align across systems.

For example, an ASCAP member may manually register a song and see a song code or work record inside the ASCAP portal, but still need to determine whether that work correlates with an existing public registration. If a work appears to be unresolved, delayed, duplicated, or in a possible-match style state, the user may need to manually search public repertoire databases and compare details such as:

* Work title
* ASCAP song code or work identifier
* Writers
* Writer IPI/CAE numbers
* Publishers
* Ownership shares
* ISWC
* Alternate titles
* Public repertoire status

This process can be slow, repetitive, and error-prone, especially when similar works exist with slightly different titles, missing writers, incorrect shares, or conflicting publisher information.

---

## Solution

ASCAP Registration Triage helps users compare their ASCAP work metadata against candidate public repertoire records and produce a structured discrepancy report.

At a high level, the tool helps answer:

> “Which public work record most likely matches or conflicts with my ASCAP registration, and what metadata differences should I review?”

The system is designed to:

1. Capture or accept ASCAP portal metadata for a work.
2. Accept candidate public repertoire records from Songview, ASCAP, or BMI searches.
3. Normalize messy music metadata such as titles, names, identifiers, and shares.
4. Rank likely matching records using fuzzy matching and weighted scoring.
5. Flag discrepancies in writers, publishers, shares, ISWC, titles, and identifiers.
6. Generate an exportable report that can support follow-up with ASCAP, a publisher, administrator, or collaborator.

---

## Who This Is For

ASCAP Registration Triage is designed for:

* Songwriters who manually register works through ASCAP
* Independent publishers
* Publishing administrators
* Managers handling multiple writer catalogs
* Music rights and royalties teams
* Students or developers interested in music metadata and rights technology

---

## Core Use Case

A user has an ASCAP work record with metadata such as:

* Song code
* Title
* Writers
* IPI/CAE numbers
* Publishers
* Ownership shares
* ISWC, if available

The user then searches public repertoire databases and adds possible candidate records.

ASCAP Registration Triage compares the records and produces a ranked analysis.

Example output:

```text
Top Candidate Match: 91%

Possible Issues Found:
- Candidate work includes an additional writer not present in the ASCAP portal metadata.
- Publisher information differs between records.
- Writer shares do not match.
- Candidate record has an ISWC, but the ASCAP portal metadata does not show one.
```

The final report gives the user a clearer starting point for resolving the issue.

---

## Key Features

### Current / Planned MVP Features

* Manual ASCAP work metadata entry
* Candidate public repertoire record entry
* Title normalization and fuzzy title matching
* Writer name and IPI/CAE comparison
* Publisher comparison
* Share percentage comparison
* ISWC comparison
* Candidate match confidence scoring
* Field-level discrepancy detection
* Ranked candidate match results
* Exportable discrepancy report

### Future Features

* Chrome extension for capturing visible ASCAP portal metadata
* Chrome extension capture for visible Songview/ASCAP/BMI result data
* Saved investigations dashboard
* PDF report export
* CSV export
* Batch work review
* User notes and issue tracking
* Team workspace support
* Public demo dataset

---

## How It Works

The project follows a simple workflow:

```text
ASCAP Portal Metadata
        +
Public Repertoire Candidate Records
        |
        v
Metadata Normalization
        |
        v
Fuzzy Matching + Weighted Scoring
        |
        v
Discrepancy Detection
        |
        v
Ranked Results + Exportable Report
```

---

## Technical Overview

The core technical problem is **entity resolution**.

The system attempts to determine whether two separate records are likely describing the same musical work, even when the metadata is inconsistent.

Examples of metadata variation:

```text
THE GREATEST
GREATEST, THE
The Greatest - Acoustic Version
Greatest
```

```text
Andrew Rubalcava
A. Rubalcava
A Rubalcava
Rubalcava Andrew
```

The tool uses normalization, fuzzy matching, and weighted scoring to compare records in a structured way.

---

## Proposed Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* Motion for React

### Backend

* Python
* FastAPI
* Pydantic
* SQLite for MVP
* SQLModel or SQLAlchemy
* RapidFuzz for fuzzy matching

### Chrome Extension

* TypeScript
* Chrome Manifest V3
* Content scripts
* Popup interface

---

## Project Structure

Planned structure:

```text
repertoire-resolver/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── App.tsx
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── schemas.py
│   │   ├── database.py
│   │   ├── routes/
│   │   └── services/
│   │       ├── normalizer.py
│   │       ├── matcher.py
│   │       ├── discrepancy_checker.py
│   │       └── report_generator.py
│   └── requirements.txt
│
├── extension/
│   ├── manifest.json
│   └── src/
│       ├── content/
│       ├── popup/
│       └── background.ts
│
├── docs/
│   ├── problem-statement.md
│   ├── product-scope.md
│   └── technical-design.md
│
└── README.md
```

---

## Matching Logic

Candidate works are scored based on multiple metadata fields.

Example scoring factors:

| Field               | Purpose                                                 |
| ------------------- | ------------------------------------------------------- |
| Title similarity    | Detects exact or near title matches                     |
| Alternate titles    | Catches formatting or naming variations                 |
| Writer IPI/CAE      | Strong identifier for matching writers                  |
| Writer name         | Helps when IPI/CAE is missing                           |
| Publisher name      | Detects publishing metadata conflicts                   |
| Share percentages   | Finds ownership split mismatches                        |
| ISWC                | Strong work-level identifier when available             |
| Work ID / song code | Helps connect public and portal records where available |

The score is not treated as legal proof. It is a confidence indicator to help prioritize manual review.

---

## Example Discrepancies

The tool may flag issues such as:

* Missing writer
* Extra writer
* Writer name variation
* IPI/CAE mismatch
* Publisher mismatch
* Missing publisher
* Ownership share mismatch
* Title formatting difference
* ISWC missing from one record
* Multiple public records with similar metadata
* Public record not marked as reconciled, where applicable

---

## Example Report Output

```text
Work Under Review
-----------------
Title: THE GREATEST
ASCAP Song Code: 123456789
Writers: Andrew Rubalcava, Jane Smith
Publishers: Example Publishing
Shares: 50% / 50%
ISWC: Not shown

Top Candidate Match
-------------------
Title: GREATEST, THE
Source: Public Repertoire Search
Public Work ID: SV-12345
Match Score: 91%

Discrepancies
-------------
1. Candidate work includes an additional writer: Mark Lee.
2. Candidate publisher list includes Other Music Publishing.
3. Candidate share percentages differ from ASCAP portal metadata.
4. Candidate record includes an ISWC not shown in the ASCAP portal metadata.

Suggested Follow-Up
-------------------
Review writer and publisher ownership details with all relevant parties.
Use the candidate public work ID and discrepancy summary when contacting ASCAP or a publishing administrator.
```

---

## Development Status

This project is currently in early development.

Initial focus:

* Define the data model
* Build the backend matching engine
* Create a manual-entry web interface
* Generate ranked candidate match results
* Produce a clean discrepancy report

The Chrome extension will be added after the core matching workflow is functional.

---

## Local Development

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

On Windows PowerShell:

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Run backend tests:

```powershell
cd backend
python -m pytest
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to the FastAPI backend at `http://127.0.0.1:8000`.
Start the backend first, then open the Vite URL printed by `npm run dev`.

---

## Roadmap

### Phase 1: Core Matching MVP

* [ ] Define metadata schemas
* [ ] Build normalization functions
* [ ] Implement fuzzy title matching
* [ ] Implement writer comparison
* [ ] Implement publisher comparison
* [ ] Implement share comparison
* [ ] Build weighted candidate scoring
* [ ] Generate discrepancy reports

### Phase 2: Web Application

* [ ] Build landing page
* [ ] Build manual work entry form
* [ ] Build candidate record entry form
* [ ] Build results dashboard
* [ ] Add report preview page
* [ ] Add CSV or PDF export

### Phase 3: Chrome Extension

* [ ] Create Manifest V3 extension
* [ ] Capture visible ASCAP portal metadata
* [ ] Capture visible public repertoire result data
* [ ] Send captured data to the web app
* [ ] Add browser popup interface

### Phase 4: Portfolio Polish

* [ ] Add demo dataset
* [ ] Add screenshots
* [ ] Add demo video
* [ ] Add technical documentation
* [ ] Add deployment instructions
* [ ] Add production README updates

---

## Why This Project Matters

Music rights workflows depend heavily on accurate metadata. Small differences in writer names, ownership shares, publisher data, or work identifiers can create confusion and delay manual resolution.

ASCAP Registration Triage explores how software can reduce friction in that process by organizing metadata, comparing likely matches, and producing clear reports for human review.

This project combines:

* Music publishing domain knowledge
* Rights metadata analysis
* Full-stack software development
* Browser extension development
* Fuzzy matching and entity resolution
* Workflow automation
* Report generation

---

## License

This project is currently intended for educational, portfolio, and prototype purposes. A formal license will be added as the project matures.



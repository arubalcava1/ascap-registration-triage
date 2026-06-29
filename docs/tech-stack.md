# Tech Stack

## Overview

ASCAP Registration Triage is planned as a full-stack web app with a future Chrome extension.

The project has three main parts:

1. **Frontend Web App** — user interface for entering metadata, reviewing matches, and exporting reports.
2. **Backend API** — normalization, matching, scoring, discrepancy detection, and report generation.
3. **Chrome Extension** — future tool for capturing visible ASCAP and public repertoire data from the browser.

---

## Recommended Stack

| Layer      | Technology               | Purpose                                 |
| ---------- | ------------------------ | --------------------------------------- |
| Frontend   | React + TypeScript       | Build a modern, type-safe web interface |
| Build Tool | Vite                     | Fast local development                  |
| Styling    | Tailwind CSS             | Clean, responsive UI styling            |
| Components | shadcn/ui                | Professional reusable UI components     |
| Animations | Motion for React         | Smooth transitions and polished effects |
| Backend    | Python + FastAPI         | API and matching engine                 |
| Validation | Pydantic                 | Validate structured metadata            |
| Database   | SQLite                   | Simple MVP storage                      |
| ORM        | SQLModel or SQLAlchemy   | Database models and queries             |
| Matching   | RapidFuzz                | Fuzzy title/name comparison             |
| Extension  | TypeScript + Manifest V3 | Browser metadata capture                |
| Reports    | CSV / PDF export         | User-facing discrepancy reports         |

---

## Frontend

The frontend will use **React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and Motion for React**.

It should include:

* Landing page
* Work entry form
* Candidate record entry form
* Match results page
* Report preview
* Export controls

The goal is to make the app feel like a polished music-tech dashboard, not a basic form project.

---

## Backend

The backend will use **Python and FastAPI**.

It will handle:

* Input validation
* Metadata normalization
* Fuzzy matching
* Candidate scoring
* Discrepancy detection
* Report generation

Core backend modules:

```text
normalizer.py
matcher.py
discrepancy_checker.py
report_generator.py
```

---

## Database

The MVP will use **SQLite** because it is simple and easy to run locally.

The database may store:

* Works
* Writers
* Publishers
* Candidate records
* Match results
* Discrepancies
* Reports

If the project grows, SQLite can be replaced with PostgreSQL.

---

## Matching Engine

The matching engine is the most important technical part of the project.

It compares ASCAP portal metadata against public repertoire candidate records using:

* Title similarity
* Writer name similarity
* Writer IPI/CAE matches
* Publisher similarity
* Ownership share comparison
* ISWC comparison
* Public work ID comparison, when available

Each candidate receives a confidence score and a list of detected discrepancies.

---

## Chrome Extension

The Chrome extension is a later-phase feature.

It may support:

* Capturing visible ASCAP portal metadata
* Capturing visible Songview/ASCAP/BMI result data
* Sending captured data to the web app

The extension should not store ASCAP credentials, automate private ASCAP actions, or claim official ASCAP integration.

---

## Project Structure

```text
ascap-registration-triage/
│
├── frontend/
│   └── src/
│
├── backend/
│   └── app/
│       ├── routes/
│       └── services/
│
├── extension/
│
├── docs/
│   ├── problem-statement.md
│   ├── project-scope.md
│   └── tech-stack.md
│
└── README.md
```

---

## Build Order

Recommended development order:

1. Backend schemas
2. Normalization functions
3. Matching engine
4. Discrepancy detection
5. API endpoint
6. Manual-entry frontend
7. Results page
8. Report export
9. Demo dataset
10. Chrome extension

---

## MVP Stack

```text
Frontend:
React + TypeScript + Vite + Tailwind CSS + shadcn/ui

Backend:
Python + FastAPI + Pydantic + RapidFuzz

Database:
SQLite

Future Extension:
TypeScript + Chrome Manifest V3
```

This stack is modern, realistic, and strong enough to demonstrate both software engineering ability and music-industry product thinking.

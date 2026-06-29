# Project Scope

## Project Name

**ASCAP Registration Triage**

---

## Project Summary

ASCAP Registration Triage is an independent music rights metadata tool designed to help ASCAP members investigate unresolved, conflicting, or possible-match style work registration issues.

The tool allows users to enter or capture visible ASCAP portal metadata for a musical work, compare that metadata against public repertoire candidate records from sources such as Songview, ASCAP repertory, and BMI repertory, rank likely matching works, flag metadata discrepancies, and generate a structured report for follow-up.

This project is designed as a triage assistant, not an official ASCAP integration or legal ownership determination tool.

---

## Primary Objective

The primary objective is to reduce the time and confusion involved in manually comparing ASCAP work registration metadata against public repertoire records.

The tool should help users answer:

> “Which public work record most likely matches or conflicts with my ASCAP registration, and what metadata differences should I review?”

---

## In-Scope Features

### 1. Manual ASCAP Work Entry

The MVP should allow users to manually enter ASCAP portal metadata for a work.

Supported fields should include:

* Work title
* ASCAP song code or work code
* Writers
* Writer IPI/CAE numbers, if available
* Writer ownership shares
* Publishers
* Publisher IPI/CAE numbers, if available
* Publisher ownership shares, if available
* ISWC, if available
* Alternate titles, if available
* Notes
* Source URL, if available

Manual entry is the first priority because it keeps the project accessible to users who register works directly through ASCAP Member Access and do not use CWR/ACK file workflows.

---

### 2. Candidate Public Repertoire Entry

The MVP should allow users to manually enter or paste candidate public repertoire records found through Songview, ASCAP repertory, BMI repertory, or similar public lookup tools.

Candidate fields should include:

* Source name
* Public work title
* Public work ID, if available
* ISWC, if available
* Writers
* Writer IPI/CAE numbers, if available
* Publishers
* Publisher IPI/CAE numbers, if available
* Ownership shares, if available
* Reconciliation or public status indicator, if visible
* Source URL
* Raw notes or copied text

This allows users to compare their ASCAP portal work against multiple possible public matches.

---

### 3. Metadata Normalization

The system should normalize common formatting differences before comparison.

Examples include:

* Converting titles to lowercase
* Removing punctuation
* Handling title variations such as “THE GREATEST” and “GREATEST, THE”
* Removing common business suffixes from publisher names
* Standardizing IPI/CAE numbers
* Standardizing ISWC values
* Converting share values into comparable numeric formats
* Trimming whitespace and duplicate spacing
* Handling simple abbreviations or initials where possible

Normalization is required because music metadata is often inconsistent across systems.

---

### 4. Candidate Matching Engine

The system should compare one ASCAP work against one or more candidate public repertoire records.

The matching engine should consider:

* Title similarity
* Alternate title similarity
* Writer name similarity
* Writer IPI/CAE matches
* Publisher name similarity
* Publisher IPI/CAE matches
* Ownership share similarity
* ISWC match
* Work ID or song code match, if available
* Reconciliation/status indicators, if available

The engine should produce a ranked list of candidate matches.

---

### 5. Match Confidence Score

Each candidate record should receive a match confidence score.

The score should help users understand which public record is most likely related to their ASCAP portal work.

Example score labels:

* **Strong Match**
* **Possible Match**
* **Weak Match**
* **Needs Manual Review**

The score should not be treated as legal proof. It is only a triage signal.

---

### 6. Discrepancy Detection

The system should flag field-level differences between the ASCAP work and each candidate record.

Examples of discrepancies:

* Missing writer
* Extra writer
* Writer name variation
* Writer IPI/CAE mismatch
* Missing publisher
* Extra publisher
* Publisher name variation
* Ownership share mismatch
* Title formatting difference
* Different ISWC
* ISWC missing from one record
* Multiple similar candidate records
* Candidate work not visibly reconciled, if status is available

Each discrepancy should include:

* Type
* Severity
* Description
* Field involved
* Suggested review note

---

### 7. Results Dashboard

The web app should include a results screen showing:

* ASCAP work under review
* Ranked candidate matches
* Match confidence scores
* Discrepancy summaries
* Detailed comparison table
* User notes
* Report export option

The results should be understandable to both technical and non-technical users.

---

### 8. Exportable Report

The MVP should generate a structured report that users can save, copy, or export.

The report should include:

* Work under review
* Candidate match summary
* Match score
* Key metadata fields compared
* Discrepancies found
* Suggested follow-up notes
* Source URLs, if available
* Date generated

Initial export formats:

* Copyable text report
* CSV export

Future export formats:

* PDF report
* Branded report layout

---

### 9. Demo Dataset

The project should include a synthetic demo dataset.

The demo dataset should include examples such as:

* Clean match
* Title variation
* Missing writer
* Extra writer
* Publisher mismatch
* Share mismatch
* Missing ISWC
* Multiple similar candidate works
* Weak unrelated candidate

The demo data should not contain private, confidential, or real user registration data.

---

## Future Features

The following features are planned for later phases but are not required for the first MVP.

### Chrome Extension

A Chrome extension may be added after the core web app and matching engine are functional.

The extension may support:

* Capturing visible ASCAP portal metadata
* Capturing visible public repertoire search result data
* Sending captured data to the web app
* Opening an investigation directly from the browser

The extension should not:

* Store ASCAP login credentials
* Automate private ASCAP actions
* Scrape data in the background
* Claim official ASCAP integration
* Submit changes to ASCAP

---

### Saved Investigations

Future versions may allow users to save investigations.

Possible fields:

* Investigation name
* Work under review
* Candidate records
* Match results
* User notes
* Status
* Created date
* Updated date

Example statuses:

* Not started
* In review
* Likely match found
* Needs follow-up
* Contacted ASCAP
* Resolved
* Archived

---

### Batch Review

Future versions may support reviewing multiple works at once through CSV import.

Batch fields may include:

* Work title
* Song code
* Writers
* IPI/CAE numbers
* Publishers
* Shares
* ISWC
* Notes

Batch review would be useful for publishers, managers, and administrators handling larger catalogs.

---

### Team Collaboration

Future versions may support multi-user workflows.

Possible features:

* Shared workspace
* Assigned investigations
* Internal comments
* Status tracking
* Report history
* Role-based access

This is not required for the MVP.

---

### Advanced Matching

Future matching improvements may include:

* Better title variant handling
* Alternate title recognition
* Nickname or initials handling for writers
* Publisher alias mapping
* Historical match tracking
* Confidence score tuning
* Machine learning-assisted ranking

The MVP should begin with transparent rule-based scoring before adding more complex logic.

---

## Out-of-Scope Features

The following features are intentionally out of scope.

### 1. Official ASCAP Integration

The tool will not directly integrate with ASCAP’s private systems.

It will not:

* Access ASCAP internal databases
* Use private ASCAP APIs
* Modify ASCAP registrations
* Submit corrections
* Pull hidden portal data
* Represent itself as an official ASCAP product

---

### 2. Legal Ownership Determination

The tool will not determine who legally owns a musical work.

It will only compare metadata and flag differences for human review.

Users should consult ASCAP, publishers, administrators, attorneys, or other qualified parties for official ownership or registration decisions.

---

### 3. Royalty Calculation

The tool will not calculate royalty payments.

It will not estimate:

* Performance royalties
* Mechanical royalties
* Sync income
* Streaming revenue
* Retroactive payments
* Unpaid royalty amounts

The project is focused on metadata triage, not royalty accounting.

---

### 4. CWR/ACK Dependency

The MVP will not require CWR or ACK files.

This is intentional.

The project is designed to be accessible to ASCAP members who manually register works through the portal and may not have access to publisher-level CWR workflows.

CWR/ACK parsing may be considered later, but it is not part of the core MVP.

---

### 5. Background Scraping

The tool will not perform automated scraping of ASCAP, BMI, Songview, or other repertoire databases.

The safer intended model is:

* The user searches public sites themselves.
* The user enters, pastes, or captures visible data.
* The tool structures and compares that data.

This keeps the project focused on user-assisted analysis rather than unauthorized data harvesting.

---

### 6. Credential Storage

The tool will not store ASCAP usernames, passwords, or login sessions.

If a Chrome extension is added, it should only read visible page content with user permission.

---

### 7. Automated Registration Fixes

The tool will not automatically correct or resubmit registrations.

It may generate a report that helps the user prepare for follow-up, but all official corrections must be handled through the appropriate organization or administrator.

---

## MVP Definition

The minimum viable product should include:

1. A web interface for entering ASCAP work metadata.
2. A web interface for entering candidate public repertoire records.
3. Backend schemas for works, writers, publishers, candidates, matches, and discrepancies.
4. Metadata normalization functions.
5. A rule-based matching engine.
6. Candidate match scoring.
7. Discrepancy detection.
8. A results page.
9. A copyable or exportable report.
10. A synthetic demo dataset.

The MVP is complete when a user can manually enter one ASCAP work, enter several candidate public repertoire records, run the analysis, view ranked matches, see discrepancy explanations, and generate a report.

---

## Success Criteria

The project should be considered successful if it can:

* Clearly explain the music industry problem being solved
* Accept realistic ASCAP-style metadata
* Accept realistic public repertoire candidate metadata
* Compare records in a structured way
* Rank likely matches
* Explain discrepancies clearly
* Generate a useful report
* Avoid overclaiming official or legal functionality
* Be understandable to both music industry users and technical reviewers
* Demonstrate full-stack development, data normalization, fuzzy matching, and product thinking

---

## Technical Scope

### Frontend

The frontend should provide a polished, modern web experience.

Planned technologies:

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* Motion for React

Frontend responsibilities:

* Landing page
* Work entry form
* Candidate entry form
* Results dashboard
* Report preview
* Export controls
* Clean error states
* Responsive layout

---

### Backend

The backend should provide the matching and analysis logic.

Planned technologies:

* Python
* FastAPI
* Pydantic
* SQLite
* SQLModel or SQLAlchemy
* RapidFuzz

Backend responsibilities:

* Validate input data
* Normalize metadata
* Compare works
* Score candidate matches
* Detect discrepancies
* Return ranked results
* Generate report data
* Store investigations, if persistence is included

---

### Chrome Extension

The Chrome extension is a later-phase enhancement.

Planned technologies:

* TypeScript
* Chrome Manifest V3
* Content scripts
* Popup UI

Extension responsibilities:

* Capture visible ASCAP portal metadata
* Capture visible public repertoire result data
* Send captured data to the web app
* Avoid credential storage or automated private actions

---

## Non-Functional Requirements

The project should prioritize:

* Clarity
* Accuracy in claims
* Privacy
* Explainability
* Maintainable code
* Clean documentation
* Strong demo experience
* Professional user interface
* Transparent scoring logic
* Safe handling of user-provided data

---

## Project Positioning

ASCAP Registration Triage should be positioned as:

> A metadata triage and reporting assistant for ASCAP work registration review.

It should not be positioned as:

> An official ASCAP tool, legal decision system, royalty calculator, or automatic registration fixer.

The strongest version of this project is a focused, honest tool that helps users investigate real metadata issues faster.

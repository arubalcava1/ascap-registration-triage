# User Flow

## Overview

ASCAP Registration Triage helps users compare ASCAP portal work metadata against public repertoire candidate records from sources such as Songview, ASCAP repertory, and BMI repertory.

The tool is designed as a metadata triage assistant. It does not determine legal ownership, access ASCAP’s internal systems, or automatically fix registrations.

---

## Primary User

The primary user is an ASCAP member or music rights worker who needs to investigate a work registration.

Examples include:

* Songwriters
* Independent publishers
* Publishing administrators
* Managers
* Catalog administrators
* Music rights team members

The workflow is designed for users who manually register works through ASCAP and may not have access to CWR or ACK file workflows.

---

## User Goal

The user wants to answer:

> “Which public work record most likely matches or conflicts with my ASCAP registration, and what metadata differences should I review?”

---

## MVP User Flow

```text
1. User creates a new investigation.
2. User enters visible ASCAP portal work metadata.
3. User adds one or more public repertoire candidate records.
4. User runs match analysis.
5. System ranks candidate records by likely match strength.
6. System highlights metadata discrepancies.
7. User generates a report for follow-up.
```

---

## Step 1: Create Investigation

The user starts a new investigation for one musical work.

The investigation may include:

* Work title
* ASCAP song code or work code
* Source URL
* User notes

The purpose of the investigation is to keep all metadata, candidate matches, discrepancies, and reports organized around one work.

---

## Step 2: Enter ASCAP Work Metadata

The user enters metadata visible in the ASCAP portal.

Possible fields include:

* Title
* Song code or work code
* Writers
* Writer IPI/CAE numbers
* Writer shares
* Publishers
* Publisher IPI/CAE numbers
* Publisher shares
* ISWC, if available
* Alternate titles, if available

Not every field is required. Missing metadata should reduce confidence where relevant, but it should not block the user from running an analysis.

---

## Step 3: Add Public Repertoire Candidates

The user searches public repertoire sources outside the app and adds possible candidate records.

Candidate sources may include:

* Songview
* ASCAP repertory
* BMI repertory

Candidate fields may include:

* Source
* Public work title
* Public work ID
* ISWC
* Writers
* Writer IPI/CAE numbers
* Publishers
* Ownership shares
* Reconciliation or public status indicator, if visible
* Source URL

The MVP should support manual entry and pasted text. Chrome extension capture can be added later.

---

## Step 4: Run Match Analysis

The user runs the analysis after entering the ASCAP work and candidate records.

The system should:

1. Normalize metadata.
2. Compare the ASCAP work against each candidate.
3. Calculate a match confidence score.
4. Detect field-level discrepancies.
5. Rank candidate records from strongest to weakest match.

Comparison factors may include:

* Title similarity
* Writer name similarity
* Writer IPI/CAE matches
* Publisher similarity
* Share comparison
* ISWC comparison
* Public work ID comparison, when available

The score is only a triage signal. It is not legal proof or an official ASCAP determination.

---

## Step 5: Review Results

The results page should show:

* The ASCAP work under review
* Ranked candidate records
* Match confidence scores
* Key matching evidence
* Key discrepancies
* Source links, if available

Example result:

```text
Strong Match — 91%

Title: GREATEST, THE
Source: Public Repertoire Search
ISWC: T-123456789-0

Matching Evidence:
- Similar title
- Two matching writers
- Matching publisher

Discrepancies:
- Candidate includes an extra writer
- Ownership shares differ
- Candidate includes an ISWC not shown in ASCAP portal metadata
```

---

## Step 6: Generate Report

The user generates a report after reviewing the results.

The report should include:

* Work under review
* Candidate records reviewed
* Top likely match
* Match confidence score
* Matching evidence
* Discrepancies found
* Source URLs
* Suggested follow-up notes
* Disclaimer

MVP export options:

* Copyable text report
* CSV export

Future export options:

* PDF report
* Saved report history

---

## Future Chrome Extension Flow

A later version may include a Chrome extension.

The extension may allow the user to:

1. Open an ASCAP portal work page.
2. Capture visible ASCAP metadata.
3. Open a public repertoire search result.
4. Capture visible candidate data.
5. Send captured data to the web app.
6. Run the same match analysis workflow.

The extension should not:

* Store ASCAP credentials
* Access hidden ASCAP data
* Automate private ASCAP actions
* Scrape in the background
* Claim official ASCAP integration

---

## Key Edge Cases

The tool should handle common incomplete-data cases.

| Scenario                  | Expected Behavior                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Missing ISWC              | Continue analysis and mark ISWC as not provided                                         |
| Missing song code         | Continue analysis using title, writers, publishers, and other fields                    |
| No candidate records      | Ask user to add at least one candidate before analysis                                  |
| Multiple strong matches   | Warn user to review discrepancies carefully                                             |
| Low match scores          | Suggest adding more candidate records or searching by writer, title, publisher, or ISWC |
| Incomplete candidate data | Lower confidence and mark missing fields clearly                                        |

---

## Safety Boundaries

ASCAP Registration Triage should remain neutral and evidence-based.

The tool should say:

* “Needs review”
* “Possible discrepancy”
* “Candidate includes an additional writer”
* “Match confidence is limited by missing data”

The tool should not say:

* “This registration is wrong”
* “This is the exact cause”
* “ASCAP rejected this”
* “This work is legally invalid”
* “This will fix the registration”

Official resolution must happen outside the tool through ASCAP, a publisher, administrator, collaborator, or qualified rights professional.

---

## Final Summary

The intended user flow is:

```text
Enter ASCAP work
Add public candidates
Run analysis
Review ranked matches
Review discrepancies
Generate report
Follow up outside the tool
```

The tool succeeds when it turns scattered manual research into a clear, organized metadata report that helps the user decide what to review next.

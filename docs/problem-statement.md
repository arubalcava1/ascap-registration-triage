# Problem Statement

## Overview

Music rights administration depends on accurate and consistent work registration metadata. For songwriters, publishers, and administrators, even small differences in titles, writer names, IPI/CAE numbers, publishers, ownership shares, or identifiers can make it difficult to determine whether a registered work is correctly represented across systems.

**ASCAP Registration Triage** addresses a practical workflow problem: ASCAP members may have access to a song/work record inside the ASCAP portal, but still need to manually investigate whether that record corresponds to an existing public repertoire entry or whether conflicting metadata may be contributing to an unresolved or possible-match style registration issue.

This project is designed to help organize that investigation process.

---

## The Problem

When an ASCAP member registers a musical work, the work may not always be easy to confirm across public repertoire systems. A user may see metadata inside the ASCAP portal, such as a song code, title, writers, publishers, shares, and possibly an ISWC, but still be unsure whether the work cleanly correlates with public records in Songview, ASCAP repertory, or BMI repertory.

If a registration appears unresolved, delayed, duplicated, or potentially in conflict with an existing work, the user often has to manually search public repertoire databases and compare multiple candidate works.

This process can require checking:

* Work titles and alternate title formats
* Writer names
* Writer IPI/CAE numbers
* Publisher names
* Publisher IPI/CAE numbers, when available
* Ownership shares
* ISWC values
* Work IDs or song codes
* Reconciliation indicators or public repertoire status
* Similar works with overlapping writers or publishers

The current process is manual, repetitive, and easy to get wrong. Users may need to open multiple public search results, compare fields line by line, take notes, and create their own summary before contacting ASCAP, a publisher, a co-writer, or an administrator.

---

## Why This Matters

Music metadata issues can slow down registration review and create confusion around ownership, attribution, and royalty administration. If a work is not clearly matched or reconciled, the people responsible for the work may have to spend extra time identifying what information does not align.

For independent songwriters and smaller publishers, this can be especially frustrating because they may not have access to advanced internal administration tools. They may only have the visible ASCAP portal record and public repertoire search tools.

A faster triage process can help users identify likely issues sooner, such as:

* A missing or extra writer
* A publisher mismatch
* Different ownership shares
* A title variation
* A missing or different ISWC
* Multiple public works that appear similar
* A public work that may not clearly reconcile with the user’s portal metadata

The goal is not to make legal ownership decisions. The goal is to give users a clearer starting point for human review and follow-up.

---

## Target Users

ASCAP Registration Triage is intended for users who need a more organized way to investigate work registration metadata, including:

* Songwriters who manually register works through ASCAP
* Independent publishers
* Publishing administrators
* Managers assisting writers with catalog administration
* Music rights and royalty teams
* Students, developers, or researchers studying music metadata workflows

The project is especially focused on accessibility for users who do not rely on CWR/ACK file workflows and instead interact with ASCAP registrations through the member portal.

---

## Current Workflow Pain Point

A typical manual investigation may look like this:

1. The user opens a work record inside the ASCAP portal.
2. The user copies the song code, title, writer names, publisher names, shares, and other visible metadata.
3. The user searches Songview, ASCAP repertory, or BMI repertory.
4. The user opens multiple possible candidate works.
5. The user compares each candidate against their ASCAP portal metadata.
6. The user manually checks for title, writer, publisher, share, and identifier differences.
7. The user creates their own notes or report.
8. The user contacts ASCAP, a publisher, a co-writer, or an administrator with limited structured evidence.

This workflow is inefficient because the comparison is not centralized. The user has to manually gather, compare, rank, and summarize the information.

---

## Proposed Solution

ASCAP Registration Triage provides a structured workflow for comparing ASCAP portal metadata against public repertoire candidate records.

The system allows a user to:

1. Enter or capture visible ASCAP portal work metadata.
2. Add candidate public repertoire records from Songview, ASCAP repertory, or BMI repertory.
3. Normalize inconsistent metadata formatting.
4. Compare the ASCAP work against each candidate.
5. Rank likely matching or conflicting works.
6. Highlight field-level discrepancies.
7. Generate a report for follow-up.

The tool is intended to function as a triage assistant. It helps users identify where to look first and what differences may deserve attention.

---

## What the Tool Should Help Answer

ASCAP Registration Triage is designed to help answer questions such as:

* Which public repertoire work most likely matches my ASCAP portal work?
* Are there multiple public works that look similar to my registration?
* Do the writers match?
* Do the writer IPI/CAE numbers match?
* Do the publishers match?
* Do the ownership shares match?
* Is there an ISWC shown publicly that is missing from my portal metadata?
* Is the title formatted differently across systems?
* What discrepancies should I include in a follow-up report?

---

## What the Tool Does Not Do

This project has clear limitations.

ASCAP Registration Triage does **not**:

* Access ASCAP’s internal matching system
* Claim to know ASCAP’s internal reason for a registration status
* Determine legal ownership
* Automatically fix registrations
* Submit corrections to ASCAP
* Replace a publisher, administrator, attorney, or PRO representative
* Store ASCAP login credentials
* Require users to upload CWR or ACK files

The tool only assists with organizing and comparing user-provided and publicly available metadata.

---

## Core Technical Challenge

The main technical challenge is **entity resolution**.

The system must determine whether two records likely describe the same musical work, even when the metadata is inconsistent.

For example:

```text
ASCAP Portal Title:
THE GREATEST

Public Repertoire Candidate:
GREATEST, THE
```

Or:

```text
ASCAP Portal Writer:
Andrew Rubalcava

Public Repertoire Writer:
A. Rubalcava
```

The tool must normalize text, compare identifiers, calculate similarity, detect discrepancies, and rank candidate matches in a way that is useful to a human reviewer.

---

## Success Criteria

The project is successful if it can:

* Accept structured ASCAP work metadata
* Accept structured public repertoire candidate metadata
* Normalize common music metadata variations
* Rank candidate works by likely match strength
* Detect meaningful discrepancies across key fields
* Present results in a clear and understandable interface
* Generate a report that a user could use for follow-up
* Avoid overclaiming legal, financial, or official ASCAP functionality

A strong MVP should help a user reduce the time spent manually comparing possible matching works and provide a clearer explanation of what metadata differences may need review.

---

## Example Scenario

A songwriter manually registers a work in ASCAP titled **“THE GREATEST.”**

Inside the ASCAP portal, the work shows:

```text
Title: THE GREATEST
Song Code: 123456789
Writers: Andrew Rubalcava, Jane Smith
Publishers: Example Publishing
Shares: 50% / 50%
ISWC: Not shown
```

The user searches public repertoire records and finds a candidate work:

```text
Title: GREATEST, THE
Writers: Andrew Rubalcava, Jane Smith, Mark Lee
Publishers: Example Publishing, Other Music Publishing
Shares: 33.33% / 33.33% / 33.34%
ISWC: T-123456789-0
```

ASCAP Registration Triage would identify this as a strong possible candidate because of the title and writer overlap, but would flag important discrepancies:

* Candidate work includes an additional writer
* Candidate work includes an additional publisher
* Ownership shares differ
* Candidate work includes an ISWC not shown in the portal metadata

The final report would help the user decide what to review before contacting ASCAP, a publisher, or collaborators.

---

## Project Goal

The goal of ASCAP Registration Triage is to make music registration review more organized, transparent, and efficient for users who need to investigate metadata conflicts manually.

By combining music rights domain knowledge with full-stack software development, fuzzy matching, metadata normalization, and report generation, this project demonstrates how software can reduce friction in a real music industry workflow.

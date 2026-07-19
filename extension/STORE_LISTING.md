# Chrome Web Store Listing Draft

## Name

ASCAP Registration Triage

## Short Description

Capture ASCAP public repertoire results, rank likely work matches, and copy the ASCAP Work ID.

## Detailed Description

ASCAP Registration Triage is an independent browser-assisted review tool for music rights metadata workflows. It helps a reviewer enter ASCAP work metadata, open the matching ASCAP public repertoire search, capture visible public result records, rank likely ASCAP work matches, and copy the ASCAP Work ID used in follow-up workflows.

The extension runs directly in Chrome. It can compare captured ASCAP writers against advisory public songwriter reference data from public metadata sources such as MusicBrainz, Wikidata, and Wikipedia. This helps identify cases where similar ASCAP results have the same title but different writer sets.

This tool is designed for triage and review support. It is not affiliated with ASCAP and is not an official ASCAP integration, legal determination system, royalty calculator, or registration fixer.

## Key Features

- Open ASCAP public repertoire searches from entered metadata.
- Fill ASCAP public search fields from title, ISWC, work ID, performer, writer, or publisher.
- Capture visible ASCAP public result records from the active tab.
- Analyze and rank candidate works inside the extension.
- Compare captured ASCAP writers against advisory public metadata references.
- Flag likely writer discrepancies for review.
- Copy the ASCAP Work ID from ranked results.
- Copy an optional review report.
- Choose local visual themes.

## Required Setup

No local backend, server, Python environment, or separate web app is required for normal extension use.

Users only need Chrome and access to ASCAP public repertoire pages. Public writer-reference checks require internet access to the supported public metadata sources.

## Permissions Rationale

- `activeTab`: lets the extension act on the current ASCAP public repertoire tab after the user clicks a button.
- `scripting`: lets the extension fill visible ASCAP search fields and capture visible public result text.
- `storage`: saves local work fields, captured candidates, analysis state, and theme preference.
- `https://www.ascap.com/*`: limits page interaction to ASCAP public pages.
- `https://musicbrainz.org/*`: allows advisory public songwriter metadata lookup.
- `https://www.wikidata.org/*`: allows advisory public songwriter metadata lookup.
- `https://en.wikipedia.org/*`: allows advisory public songwriter metadata lookup.

## Guardrails

- Captures only visible public ASCAP repertoire text.
- Does not store ASCAP, BMI, Songview, or private portal credentials.
- Does not automate private ASCAP member portal workflows.
- Does not bypass CAPTCHA, login prompts, or access restrictions.
- Does not use hidden ASCAP endpoints.
- Does not perform bulk scraping.
- Public metadata reference data is advisory and does not replace human review.

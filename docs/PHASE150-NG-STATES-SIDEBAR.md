# PHASE 150 - Nigeria state coordinators, sidebar per document, loud chime, /wgmn path
Build v71.1 · db 118 · 9 Sep 2026

## Nigeria State and Assistant State Coordinators
Migration 118 loads the founder's updated list: 73 rows, 37 states (Imo has a State
Coordinator without an email or an assistant on the list; Kwara's and Ondo's State
Coordinators have no phone). Accounts → "Load CR/DCR contact list" now applies BOTH
lists: it matches each person to WDOS by email or name, fills missing email, phone,
state and appointment date on the directory row, and adds anyone missing. "Abuja
(FCT)", "FCT (Abuja)" and "Nassarawa"/"Nasarawa" resolve to the same state unit.
"Create logins for all leaders without one" seats each State/Assistant State
Coordinator at her state unit under Nigeria and sets the seat's start date to the
appointment date on the list (14 March or 11 June 2026), so Ngunan Addingi sees them
under My Country with their real service dates, can message each, assign tasks from
Tasks, and follow their reports and responsiveness.

## Sidebar exactly as the document
All 17 sections and every sub-section (1.1 to 17.3) are entries; sections collapse
and the current one stays open. Every entry resolves to a registered screen
(harness/deadlink-check.mjs: 109 hashes, 2 hrefs, 0 dead). Where a sub-section's
own screen is not built, the entry opens the closest screen holding that
information; where a member does not hold a module (Tasks, Meetings, Recruitment,
Members, Announcements, Programmes), the entry falls back to a screen she can open.
The document's fields under each sub-section are the screens' content, built
progressively; the navigation is complete today.

## Notification sound
Task, message and announcement chimes now play at full gain (1.0, the browser's
maximum), two rising tones, longer. The phone's own volume still applies; a phone on
silent stays silent.

## /wgmn and /wnnn
The app now recognises the path itself (no Netlify redirect needed) and opens the
right door with the WODDI logo and the WGMN logo side by side; a `_redirects` file
inside app/ also covers it. Phone label reads "Phone number" (mandatory).

## Deploy
Run 118_ng_state_coordinators_contacts.sql; drag `app` to both Netlify sites → badge
v71.1 · db 118. Then Accounts → Load CR/DCR contact list → Create logins for all
leaders without one → Print / Save as PDF.

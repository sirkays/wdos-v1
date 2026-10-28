# PHASE 218 - Profile form wipes fixed and restored; 14-Day passed list downloads
Build v85.3 · db 171 (migrations 170 and 171 ALREADY LIVE via the Supabase connector) · 3 Oct 2026.
To deploy the app: extract `wdos-v85.3-update.zip` over your `app` folder (replace files), then drag `app` to both Netlify sites. The pack also contains v85.0 to v85.2.

## 1. The profile form was wiping people's data (my bug, in WDOS code)

### What happened
- **Until v78.0 (1 to 2 Sep):** the profile the app loaded at sign-in did not include country, state, position or LGA. The "Complete your profile" form therefore opened with those boxes empty. Every Save sent every box, so pressing Save, even just to change a phone number, wrote the empty boxes over the stored values.
- **v78.0** added country, state and position to the load, but never LGA, so LGAs could still be wiped.
- **The volunteer Profile tab** (`#/my/profile`, the live form today) had a second path. A stored country that is not exactly one of the dropdown options (for example "Nigeria, Katsina") showed as "—" and was saved as empty.

### Evidence (audit log, the person's own saves)
- Between 31 Jul and 2 Sep: 70 position wipes, about 50 LGA wipes, 60 state wipes and 65 country wipes.
- Many people noticed and typed the values back. Others did not.

### Fix (three layers, so it cannot recur)
1. **The forms save only what changed.** This applies to both the Profile tab and the old Complete-your-profile form. A box that opened empty is never sent unless the person types in it. The shared helper is `saveMyProfileChanges()` in db.js.
2. **The forms show and keep unusual stored values.** A stored country, state or position that is not in the dropdown is added as an option, so it shows and is kept. The old form also fills itself from a fresh read of the person's row. LGA is now part of the signed-in profile (`PROFILE_COLUMNS`), and the context cache key moved to `wdos.ctx.v2` so old copies without LGA are dropped.
3. **The database refuses the wipe** (migration 170, trigger `profiles_keep_filled`). When a person saves their own profile, an empty value can no longer replace a filled name, phone, position, country, state or LGA. A real move (new country with a new state, or new state with a new LGA) still clears what belongs to the old place. HQ editing someone else is not affected.

### Restored (migration 170 part 1, live)
- **What:** 19 countries, 13 states, 14 LGAs and 21 positions, across 32 people. These are 67 values, each logged in the audit log with the reason "Phase 218: restored…".
- **Rules:** the value restored is the last one the person entered, taken from the audit row of the save that wiped it. It is restored only if:
  - the field is still empty;
  - nothing has changed it since;
  - a state goes back only with the country it was entered with;
  - an LGA goes back only with its state.
- **Dry run first:** a rolled-back trial produced the same counts, with no change to any status, journey or activation.
- **Includes leaders:** Binta Coulibaly (Mali), Yorou Barkissou (Benin, Borgou, Parakou), ARIYO Oluwaferanmi, Oreke Chinazor, Patience Opega and Tarnue Z. Brown.

### Tested
- **Guard,** as a real user in a rolled-back transaction:
  - a blank save keeps country, state, LGA, position, name and phone;
  - a genuine move to Ghana / Greater Accra is allowed;
  - HQ can still clear another person's LGA.
- **Browser,** Profile tab with a stored country "Nigeria, Katsina":
  - the country shows;
  - Save with no changes sends nothing;
  - changing only the phone sends only `{"phone": ...}`.

## 2. 14-Day Activation: candidates who passed, as PDF, CSV and Excel

Regina asked for the candidates who passed the 14-Day Activation with name, email, phone, network, position applied for and location. After that list was checked by hand, she asked for WDOS to produce it on demand.

### Where
- **Activation & Readiness** (`#/hq/activation`, in Regina's sidebar) has a third tab, **14-Day Activation**. It shows:
  - the totals: passed, WGMN, WNNN, countries, and how many now hold a seat;
  - **Download the list: PDF · CSV · Excel**;
  - a searchable table of everyone who passed.
- **Reports > 14-day activation** gets the same three buttons. Regina's account does not have the Reports module; HQ roles that do have it will see them there.

### Data
- `activation_passed_export()` (migration 171) is HQ only, with the same check as `activation_report()`. Signed-out callers are refused ("permission denied"), and so are ordinary members ("HQ only").
- **Passed** means the journey status is "completed". WDOS sets that only when its evaluation passes: all 46 required tasks, both gate days, and a score of at least 50%.
- Candidates who have since been given a seat **are included**, and their seat is shown. `activation_report()` leaves them out, which is why its Passed tile shows 71.
- **Live today:** 77 (63 WGMN, 14 WNNN; Nigeria 75, Ghana 1, Burundi 1; 6 hold seats).

### Files
- **PDF:** landscape A4 with the WODDI logo and colours, totals, a summary by position, one table per network, notes and a confidentiality footer. About 95 KB.
- **CSV:** UTF-8 with a BOM, so Excel shows accents correctly. Columns: No, Name, Email, Phone, Network, Position applied for, LGA, State, Country, Already holds a leadership seat.
- **Excel:**
  - a "Passed candidates" sheet with the same columns, phone numbers stored as text and a filter on the header row;
  - a "Summary" sheet with counts by network, country and position, and the pass rule.
- **Formatting:** names and places get consistent capitalisation, and phone numbers use one international format with the same digits. The data itself is not changed.

### Tested (browser, as Regina, with fixture data checksum-equal to the live export)
- **Tab:** the badge shows 77; the tiles are right; the table has 77 rows; searching "katsina" finds Usman Rabiu; all three downloads work with one database call; switching back to the 3-day tab works.
- **Reports row:** all three downloads work.
- **File contents:** all 77 rows match the database on every field; Excel is identical to the CSV; the PDF contains all 77 emails and no dashes.

## 3. Small fix found while testing
The Reports page died ("Cannot read properties of null") if the task or meeting statistics call failed, even though its comment says a failed widget should show empty. `tasks`, `meetings` and `coverage` now fall back to empty.

## Regression (all passing)
- **Pages as Regina:** home, ops, leaders, ops reports, reports, activation, mailboxes. Zero errors.
- **Leader:** home, plus ops correctly blocked.
- **Onboarding:** the Chad and Osun cases.
- **Sign-in:** Google sign-in; the candidate sign-in loop; the loop breaker; the expired-token loop; the account-service banner.
- **Import checker:** 1,158 names across 93 modules, 0 problems.

## Files
- **Database** (live; records in `supabase/migrations/`):
  - `170_profile_form_wipes_restore_and_guard.sql`
  - `171_activation_passed_export.sql`
- **App, new:** `js/core/passedexport.js`
- **App, changed:**
  - `js/core/db.js`: `PROFILE_COLUMNS` with lga, `saveMyProfileChanges`, `activationPassedExport`, v85.3, schema 171
  - `js/app.js`: context cache v2
  - `js/pages/home.js`: Profile tab
  - `js/pages/me.js`: Complete-your-profile form
  - `js/pages/hqactivation.js`: 14-Day tab
  - `js/pages/reports.js`: passed-list row and empty-widget fallbacks
  - `assets/css/wdos.css`: three-tab layout
  - `locales/en.json` and `locales/fr.json`: 23 new keys
  - `sw.js`: wdos-v85.3, caches passedexport.js
  - `index.html`

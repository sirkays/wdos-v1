# PHASE 196 - One referral link, the form captures position and place, 7-Day
Build v83.0 · db 148 · 17 Sep 2026 (app + ONE migration: 148_single_link_form_geo_7day.sql)

The Founder, via Azeez: one single non-personalised link for every referral;
the form asks for the position, then the country, the state, the local
government and the ward named "Community Cluster (Ward)", with each African
country's own words for those levels; the 14-day activation becomes 7 days;
everything she enters and everything she does must be in the HQ master
dashboard. Built to the "Implementation Document for Princewill" pack.

## The one link
woddicrm.org/#/join/WODDI. Fixed code, never expires unless HQ pauses it. HQ
sees it at the top of Activation & Readiness with visits (all time, 7 days,
30 days), last opened, registrations, Copy, WhatsApp and Pause/Resume. Every
leader sees the same link under My Referrals to send on. The per-seat link
creator and per-link tracker from Phases 192-193 are removed from the UI
(their tables remain; older per-seat links still work).

## The form (#/join/WODDI)
Brand header (WODDI wordmark, language), the network logo, then three parts:
- About you: first name, last name, email, phone (required, validated), date
  of birth (network follows age; the logo and the position titles switch to
  WNNN Lead titles for 18-29), photograph (required, preview, uploaded to her
  avatar).
- The position and where you will serve: position (State Coordinator,
  Assistant, State Secretary, LGA Coordinator, Assistant, Community Cluster
  Coordinator, Assistant, Chapter Coordinator, Assistant; Lead titles in
  WNNN), then Country -> level 2 -> level 3 -> level 4. Lists come from the
  live structure; where a country has no list at a level yet, she types the
  name and HQ still receives it.
- Your login: password twice, privacy consent.
Level names per country come from the new country_activation_levels table (54
African countries seeded, e.g. Nigeria: State / Local Government Area (LGA) /
Community Cluster (Ward); Ghana: Region / District / Community Cluster
(Electoral Area); Kenya: County / Sub-County / Community Cluster (Ward);
Cameroon: Region / Department / Community Cluster (Commune)). HQ can edit
any row in that table; the form picks it up immediately.
Stored on her activation: position_code, geo_country, geo_state, geo_lga,
geo_cluster, country iso, and the whole form as JSON; her profile gets
country, state and the resolved org unit.

## 7-Day replaces 14-Day
activation_settings.open7_days = 7 and every 14-Day label in the app now
reads 7-Day. The 7-Day route content (seven days, from the pack) was already
loaded in 146; HQ opens it for a screened applicant with open_activation_for.

## HQ master dashboard (#/hq/activation), rebuilt
1. The referral link, with its numbers.
2. Activation at a glance: candidates, 3-Day / 7-Day, WGMN / WNNN, in
   progress, completed, incomplete, extensions asked, assessments submitted /
   returned / reviewed, selected, reserve, further review, not selected.
3. By position; by country; by state or region; day by day per route with
   completion rates.
4. Candidate register: search and filters (route, network, status, country),
   CSV export, and one card per candidate with her photograph, position and
   place, day dots (grey / amber / green / pink = returned), status and
   outcome. Open the card: everything from her form (email, phone, date of
   birth, language, network, position, country, state, LGA, community
   cluster), her progress (started, deadline, completed, extension,
   assessment, score with the critical-rule flag, outcome, reviewer), and her
   activities day by day (status, started, completed, time spent,
   acknowledgements, every answer she wrote). Review / return / outcome and
   extension decisions are on the card.
Command Centre and HOFCO cards keep the summary numbers.

## Deploy
1. SQL Editor -> run 148_single_link_form_geo_7day.sql (after 146, 147).
2. Drag `app` (v83.0) to both sites -> badge "build v83.0 · db 148".
3. Open woddicrm.org/#/join/WODDI on a phone and register a test candidate
   with a real place; then open Activation & Readiness as HQ and open her card.

## Not built / honest limits
- Lists below state level exist only where the structure holds them (Nigeria
  has states and LGAs; most countries have country only). Typed names fill
  the gap and are stored as typed; HQ can later attach them to the structure.
- Screening before the route is still the link itself.
- Candidate email prompts remain unwired to the mailer.

## v83.1 (Phase 197, migration 149) - positions and geography for every country
Azeez: no Country Representative / Deputy in the position list; and other
countries must have state and local government equivalents in the database.
- Position list now starts with Country Representative and Deputy Country
  Representative (Country Lead / Deputy Country Lead in WNNN).
- Migration 149 seeds level 2 (state / region / province) for all 53 other
  African countries, 774 units from ISO 3166-2, and level 3 (district / LGA /
  department / commune) for 13 countries where the lists are established:
  Rwanda, Uganda, Malawi, Sierra Leone, South Africa, Cameroon, Togo,
  Senegal, Benin, Zimbabwe, Zambia, The Gambia, Liberia, plus Ghana's Greater
  Accra and Ashanti regions. About 900 level-3 units.
- Where a country's level 3 is not yet in the database (Ghana's other
  regions, Kenya sub-counties, Tanzania districts, and so on), the form
  still works: she chooses "Not listed, I will type it" and HQ receives the
  name as typed. Any of these lists can be added later the same way.
- The confirm query at the end of 149 prints a per-country count of level 2
  and level 3 units so you can see what is now in the database.

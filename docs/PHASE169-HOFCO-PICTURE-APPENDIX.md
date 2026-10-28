# PHASE 169 - HOFCO screen per the founder's picture; volunteer sidebar appendix
Build v77.0 · db 130 · 10 Sep 2026

## HOFCO screen additions (her picture)
- Two network panels side by side under the tiles: WGMN (magenta) and WNNN
  (lemon), each with the network name, motto, countries operational, active
  leaders, reports outstanding, activities this period, a mini Africa map lit
  for that network's coverage, and "View WGMN / WNNN details". Data:
  central_admin('WGMN') and central_admin('WNNN').
- Leadership coverage by network and region: West, East, Central, Southern,
  North Africa (AU regions, geo.js AF_REGIONS), WGMN against WNNN, with the
  countries-with-leaders line under each region.
- Country status map: On track / Attention / At risk / Intervention (the same
  rule as the country table), click opens Country 360.
Everything else on the screen (attention table, work queue, country table,
engagement, reporting, activities, recent, quick actions) is unchanged from
Reference Screen 1.

## Appendix (volunteer leadership sidebar) — status
1. Recruitment pathways: the two routes are shown on the CR home and the HQ
   funnels; leaders refer and follow; HQ screens, selects, appoints (built).
2. Master engagement calendar (migration 130): items now appear on every leader's
   own calendar (My Calendar tab), filtered to her network, with "I took part"
   recording participation; HQ page #/engagement holds the calendar and the
   follow-up (built). Reminders and overdue alerts follow the daily rollover.
3. Automatic report consolidation: the monthly report already computes about
   two-thirds of its sections from records entered lower down (report_snapshot);
   higher levels add summary, challenges, interventions and priorities (built in
   Phase 134; unchanged).
4. My Delegated Portfolio: every Deputy and Assistant sees it first on her home
   and in the Tasks & Follow-Up section: assignment, delegated by, area, date
   assigned, deadline, status, evidence required, drawn from tasks assigned to
   her; the rule "delegated responsibility does not create parallel authority"
   is printed on the card. Delegation of territory / follow-up scopes beyond
   tasks is the next step and needs a delegation record (scheduled).

## Deploy
Drag `app` (v77.0) → badge v77.0 · db 130. No new SQL beyond 129 and 130.

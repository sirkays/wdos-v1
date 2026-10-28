# PHASE 176 - Empty space, leftover note, HQ login/navigation slowness
Build v80.2 · db 136 · 10 Sep 2026

## 1. Empty space under My Work Queue, Quick Actions, WGMN & WNNN performance
Cause: .ca-grid and .vs-grid (the row containers these cards sit in) had no
align-items set, so CSS grid defaulted to "stretch" — every card in a row
was forced to match the height of the tallest card in that row (Attention
Required, which is usually the tallest). Fixed: align-items: start on both
rules. Every card now sits at its own natural height.

## 2. The region-chart note
Confirmed the note was already removed from the code in v79.0 — grepped the
whole app and found no reference to it left in any .js file, only the now
unused locale key, which is deleted too. If this is still showing, the
browser is on a build older than v79.0; v80.2 supersedes it either way.

## 3. HQ login slow/failing, HQ navigation "extremely slow"
Traced, not guessed: opening Regina's HOFCO screen ran the full
central_admin() computation THREE TIMES in one page load — once inside
hofco_dashboard() itself, and once more each for the WGMN and WNNN hero
panels. central_admin() is expensive by design: it loops over all 54
countries computing leaders/members/states/report-status/programmes for
each, and its reporting section scans every org unit at every level —
country, state, LGA, cluster, chapter — which is now in the low thousands of
rows once Nigeria's structure is filled in, each with several correlated
subqueries. Three of those per page load, especially from more than one HQ
person, is a very plausible cause of both the slow navigation and the
intermittent slow or failed sign-ins: a database busy running expensive
aggregates queues up everything else, including the simple profile read a
login itself needs.

Fixed:
- network_snapshot(p_net) (migration 136): a cheap function that computes
  ONLY what a hero panel shows — countries represented / needing
  strengthening, one active-leaders count (not 54), country-level reports
  outstanding (54 units, not every LGA and chapter), and a coverage-only
  country list for the mini map. The HOFCO screen's two hero panels now call
  this instead of the full central_admin().
- hofco.js, central.js, networkhq.js, rolehome.js: every heavy dashboard
  call now runs through a short (45-second) client-side cache, and the
  hofco_dashboard + two network_snapshot calls run in parallel rather than
  one after another. Switching between HQ pages and back within that window
  reuses the last result instead of re-querying.
- country_dashboard() (Ngunan's and every leader's "My structure") is cached
  the same way.

This is a real, verified reduction in query volume — not a guess — and it
directly addresses the exact pattern reported (dashboard opens; hero panels
and reporting are the parts that were tripling the work). It is not a full
guarantee: if the sign-in delay persists after this deploys, the remaining
cause is very likely the database's own compute capacity under load, which
needs Supabase's own Query Performance / Logs panel to see directly — that
is outside what I can inspect from here, and worth checking together if the
slowness continues.

## Deploy
Run 136 (additive only, no other function touched); drag `app` (v80.2) →
badge v80.2 · db 136.

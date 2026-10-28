# PHASE 208 - Scalability, accuracy, and the HQ page split by route
Build v84.2 · db 159 · 19 Sep 2026
DATABASE WORK ALREADY APPLIED LIVE through the Supabase connector (migrations
158, 158b, 158c, 159). Nothing to paste. App: drag `app` (v84.2) to both sites.

## What was measured before changing anything (pg_stat_statements, live)
- central_admin (Founder's Command Centre): mean 2.2 s, max 7.6 s
- hofco_dashboard: mean 2.3 s, max 7.2 s
- announcements read (row policy): mean 62 ms, 40,000 calls
- tasks read (row policy): mean 49 ms, 24,000 calls
- applications read (row policy): mean 91 ms, 12,000 calls
- register_contacts_apply: 7.2 s (an HQ import tool, rarely used)
- Auth logs, last 24 h: 435 token refreshes, zero refresh failures.
Database size 62 MB, 513 accounts, 1,736 org units, 134 open seats.

## The one cause
Every row-level policy and every dashboard walked the organisation tree with
a recursive query (org_unit_subtree / administered_units) once PER ROW.
Cost grew with rows x users.

## What is now live (158)
1. org_units.ancestors: every unit stores its chain up to the root, kept by
   trigger, GIN-indexed. "Is X under Y" is an array test. org_unit_subtree()
   keeps its signature but no longer recurses, so every existing caller wins.
2. my_scope_roots() / my_unit_ancestors(): the viewer's scope computed once
   per query; announcements, tasks and applications policies rewritten on it.
3. dashboard_cache + central_admin_cached() + hofco_dashboard_cached():
   the two heaviest screens are computed by pg_cron every 3 minutes (as the
   super_admin seat) and served from cache; a click costs milliseconds. The
   app's Command Centre, HOFCO, network HQ and role-home pages call the
   cached versions. Each payload carries _cached_at and _compute_ms.
4. activation_sweep runs on pg_cron every 10 minutes instead of on every
   page open of the HQ activation page.
5. hq_activation_master returns position_code, position_place (the level the
   position is for), recommendation and tie flag.

## Accuracy (159)
"Completed" now means the Understanding & Readiness Assessment is submitted.
Before, finishing the Day 3 reading set the activation to completed while the
assessment was still pending (Ade Test showed exactly that). Repaired.

## The HQ page (v84.2)
- Two route tabs at the top: 3-Day Referral Activation | 7-Day Activation,
  each with its live count. Everything below follows the chosen route and is
  computed exactly from that route's candidates: at a glance, by position,
  by country, by state, day by day, ranking, register.
- Register card: "Country Representative · Nigeria" (the position's place),
  then "Lives at: ..." (her address). The duplicate helper that produced
  "kwali, Kwali, FCT" is removed.
- 7-Day view states plainly that the route has no public link and is opened
  by HQ after screening.

## Not done, said plainly
- register_contacts_apply (7 s) and seat_from_lists (0.9 s) are HQ import
  tools; left as they are.
- Realtime (WAL polling, 5.8 M calls) is used by the notification bell; it
  is the platform's own cost and is left in place.
- Candidate emails remain unwired.

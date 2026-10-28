# PHASE 173 - HOFCO fixes: black panel, reload loop, quick actions, region chart, photo, network pages
Build v79.0 · db 132 · 10 Sep 2026

## The black box
Root cause: the Africa map fetch used `{ cache: 'force-cache' }` and never checked
that the response was actually SVG. If a deploy at any point served a 404 for
/assets/africa-map.svg, Netlify's SPA fallback returns index.html with status 200;
that whole page (dark navy sidebar included) got injected into the map div and,
because of force-cache, could stay locked in the browser even after later
deploys fixed the file. Fixed in central.js, hofco.js and the new networkhq.js:
cache: 'force-cache' removed, and any response that is not OK or does not start
with '<svg' is discarded (the map area is removed rather than showing garbage).

## The reload loop
Root cause: both central.js and hofco.js ran `setInterval(() => render(...), 60-120s)`
— a full clear-and-rebuild of the screen — meant as a quiet data refresh. On a
slower connection the spinner and repaint were visible and read as the page
reloading itself. Removed from both; the screen now loads once and stays until
the person navigates or presses View All / refreshes.

## Quick Actions
Moved from the foot of the page into the same row as Attention Required and My
Work Queue (three columns), each button solid-coloured (magenta / lemon / red)
per the founder's reference image, instead of the previous grey/white row buried
below Recent Network Activity.

## Leadership coverage by network and region
Added an "Africa (overall)" bar ahead of the five AU regions, a WGMN/lemon
legend, and a percentage label above every bar, matching the reference chart
instead of a bare bar with only a tooltip.

## Her photo
The HOFCO (and role-home) header now shows her photo (WDOS avatar, falling back
to her Drive photo, falling back to initials) beside "Welcome, Regina · Head of
Field & Country Operations (HOFCO)", not a blank magenta circle.

## Dedicated WGMN / WNNN pages
"View WGMN details" / "View WNNN details" now open #/network/WGMN and
#/network/WNNN (pages/networkhq.js): a full hero header for that network alone,
six tiles, Attention Required and both recruitment funnels scoped to the one
network, its country table, and its recent activity — no other network's
figures appear on the page.

## Deploy
App only; no new SQL. Drag `app` (v79.0) → badge v79.0 · db 132.

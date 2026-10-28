# PHASE 209 - Candidate communications live, referral source, deliverable check
Build v84.3 · db 160 · 19 Sep 2026. Database applied live via the connector; app: drag `app`.

## Checked against the Founder's Operational Calendar (Saturday 19 Sep, Azeez)
| Deliverable | Status |
|---|---|
| End-to-end journey both networks | Built; both forms live, journeys separate (WGMN/WNNN) |
| Every leadership position across both networks | 11 positions on the form; titles switch by network; appointment maps each level to its unit |
| Forms, links, buttons, dashboards, candidate access, role-based views, status movements | Built; candidate gate + candidate sidebar; status flow Not started / In progress / Completed (= assessment submitted) / Under review / Outcome |
| Leadership Pack, tester, instructions, documents uploaded and linked | Day 1-3 content and the 30-statement assessment loaded from the pack; manual read inside the step |
| **Automated communications** | **NOW LIVE**: welcome at sign-up, day-ready, reminders (not started / in progress / final 12 h, every 6 h), assessment received, returned, further review, selected, reserve, not selected, incomplete, extension received/approved/declined. Sent by the existing WODDI mailer (Brevo), each one logged; first live send verified (HTTP 201) |
| HQ monitoring: referred, started, in progress, completed, not started, difficulties | Built; per route; "difficulties" = activation errors + undelivered messages, both on the page |
| Referral-source breakdown (focal person / existing leader / individual) | **NOW CAPTURED** on the form (who referred you + name) and shown as "By referral source" and in the CSV |
| Day 1/2/3 and consolidated report | CSV export carries network, position, place, source, status, days, assessment, outcome |
| Existing users block on the activation page | Removed as instructed (the readiness RPC remains for HQ tools) |

## Not done, said plainly
- The "invited" count (people HQ has sent the link to but who have not registered) cannot come from WDOS until the master referral tracker is loaded into it; today it is an operational spreadsheet per the calendar. If HQ wants it in WDOS, an "Invited candidates" import is a small addition.
- Countdown graphics ("3 Days to Go") are communications work, not WDOS.

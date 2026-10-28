# PHASES 167-168 - HQ role homepages, decision letters, engagement engine
Build v76.0 · db 130 · 10 Sep 2026

## Role homepages (Part A, C to I of the architecture) — v76.0
Every HQ role now opens its own screen: Founder → Command Centre (strategic);
HOFCO → Reference Screen 1; Secretary, Administration, Programmes,
Communications, Finance, IT, QA → the Common HQ Dashboard shape (my overview,
attention required, my work queue, performance, recent activity, quick actions)
scoped to the role (pages/rolehome.js, SPEC per role). The role is set on
Accounts → HQ function. Finance opens with a plain "module scheduled" notice
above the organisational context it works from.

## Decision letters (migration 129)
Two templates in the Message Library, category "application", status approved:
decision_selected and decision_not_selected (editable by HQ). On every decision,
decide_application() now sends the letter by email (Brevo) and into the
candidate's WDOS inbox when she has a login, records decision_letter_sent_at and
the channel, and, for the not-selected, keeps her as an active WODDI Community
member with no leader status. Placeholders: {first_name} {network} {country}
{next_step} {hq_name}. The letter texts are drafts for the founder's approval;
she edits them on the Message Library page and the next decision uses her words.

## Volunteer Strategic Engagement & Retention engine (migration 130)
Tables engagement_items (the master calendar: weekly inspiration, monthly
personal development, bi-monthly peer, quarterly, bi-annual, Founder
appreciation, recognition, pulse checks; Scheduled → Upcoming → Due → Completed,
or Due → Missed → Follow-up required; evidence, action points), participation,
follow-ups (re-engagement tracker). engagement_status(): Active · Consistently
engaged · Declining · At risk · Inactive · Under re-engagement · Re-engaged, from
sign-ins and participation. engagement_overview(): totals, retention rate,
birthdays and milestones in 30 days, calendar, leaders needing follow-up, open
follow-ups, by country and by level. The cadence is seeded 26 weeks ahead; HQ
adds items. Daily rollover 06:15 (pg_cron). HQ page #/engagement (HOFCO and
Secretary sidebars, HOFCO row 6 "View all").

## Still waiting on content
Referral Review package and tester; 7-day / 3-day activation day content.
Readiness register: next build.

## Deploy
Run 129, then 130; drag `app` (v76.0) → badge v76.0 · db 130. Message Library →
review the two decision letters. Accounts → each HQ person → HQ function.

# PHASE 186 - WODDI HQ Messaging Engine, Weekly Inspiration on Monday
Build v81.7 · db 140 · 12 Sep 2026 (app + ONE migration: 140_hq_messaging_engine.sql)

Built to the Founder's "WODDI HQ Personalised Messaging & Weekly Inspiration
Framework" and seeded from the "WDOS Five Year Monday Weekly Inspirational
Messages Master".

## Built once, for years (framework §26, §30)
Not a Weekly Inspiration card - a messaging ENGINE. Weekly Inspiration is one
category in it. Founder's Message, Leadership Brief, Recognition, Programme
Reminder, Urgent Notice and the rest drop into the same three tables without
any new code.

- **hq_messages** - one record per message ID, per network, per language, per
  version: category, year, quarter, week, theme, graphic headline, graphic key
  thought, greeting, body, key thought, closing, signature, tagline, graphic,
  audience roles, audience countries, status (draft → review → returned →
  approved → scheduled → published → expired → archived), approved_by,
  approved_at, publish_from, publish_until.
- **hq_message_inserts** - the exact role-specific ACT line for each of the ten
  leadership levels, per network, per message. WDOS inserts ONE cell, matching
  the recipient's actual seat.
- **hq_message_delivery** - one publication history per recipient, message,
  version and channel. The unique key is the duplicate prevention the framework
  asks for (§21); opened_at and read_at give §22's metrics.

## What the leader sees (framework §4, §6, §27)
FROM WODDI HQ · Weekly Inspiration · WGMN · Week of 14 September 2026, a
graphic carrying only the approved headline and key thought, then:
Dear Grace, · THE HEADLINE · the 80-150 word message with her first name, role
title and location filled in · the highlighted key thought · THIS WEEK with the
ACT line for her exact role · the closing · — WODDI HQ · the network tagline.
"Read full message" expands and is what marks the message opened, then read.

## Monday only
The message is released on the Monday of each week and stays available until
the next Monday, then moves to her archive rather than disappearing (§18).
Week 1 = Monday 14 September 2026. Change that date in the function if HQ wants
a different start.

## Content loaded
The old title-only weekly library is DELETED, as instructed. In its place: the
first 13 weeks (three months) of the Five Year Master, for both networks -
26 complete messages and 260 role-specific inserts, word for word from the
approved document, nothing rewritten. Year 1 Quarter 1 themes: Identity and
Purpose, Character and Consistency, Service and Responsibility, Growth and
Wellbeing. Loading weeks 14-260 later is a data job, not a code change.

## Graphics
26 graphics ship inside the app (one per week per network) carrying exactly
what the Master says the artwork may carry: WODDI and network identity, the
approved graphic headline, the key thought, and the WODDI - The Nurturer
signature. Never the full message. WGMN artwork uses the deeper magenta and
green range; WNNN uses the brighter range, per the age distinction.

HONEST NOTE ON CANVA: these were generated here, not in Canva. Canva's
generator returns candidate designs that a person must pick in the Canva
widget, which cannot be driven from my side for 26 graphics. Swapping in Canva
artwork needs no code: export each at 560x380 and save it over
/assets/hq-messages/wi0NN-wgmn.svg (or .png, changing graphic_slug). The
Master's per-week photographic art direction for each network is stored in
hq_messages.graphic_direction, so whoever designs them in Canva has the
Founder's exact brief per week.

## Analytics (§22, §23)
hq_message_stats() returns targeted / displayed / opened / read and the open
rate per message per network. hq_message_seen() records opened and read.

## What is NOT built yet (stated plainly)
- HQ authoring screens: create, edit, submit, approve, schedule, pause,
  withdraw, version history and audit trail. The tables and statuses are there;
  the UI is not. Content is loaded by migration today.
- Multilingual delivery beyond the language column: the French UI is
  translated, the message CONTENT is English only. The schema links
  translations by message_id + language, so adding French, Portuguese, Arabic
  or Swahili text is a data job.
- Time-zone release: the week is resolved from the server's date, so the
  Monday boundary can be a few hours off for a leader far from UTC. Per-recipient
  07:00 local release needs a scheduler and is the next honest step.
- Weeks 14-260 of the Master are not loaded.

## Deploy
1. SQL Editor -> run supabase/migrations/140_hq_messaging_engine.sql
   (needs 137-139 already applied).
2. Drag `app` (v81.7) to both Netlify sites -> hard refresh -> "build v81.7 · db 140".

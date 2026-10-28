# PHASE 187 - Monday only, and the message in her language
Build v81.8 · db 141 · 13 Sep 2026 (app + ONE migration: 141_monday_only_and_french.sql)

Azeez, from Grace's dashboard on a Sunday: the weekly message must appear on
Monday only; and switching the interface to French left the message in English.

## 1. Monday only
my_hq_message() now returns nothing unless the day is Monday. Grace saw last
Monday's message because the first build released it on Monday and kept it
visible for the whole week (the Founder's framework §18 asks for that). Your
instruction is narrower, so the dashboard card is now strictly Monday.
Nothing is lost: My Messages passes p_any_day and shows the current week's
message every day, plus the archive of earlier ones. If HQ later wants the
framework's all-week behaviour back, it is one line in the function.

## 2. Her language
The interface was already translated; the message CONTENT existed only in
English, which is the gap I flagged when the engine shipped. Now:
- French content for all 13 weeks, both networks: headline, graphic key
  thought, the full body, key thought, closing and network tagline.
- French for the 20 role-specific ACT inserts (10 leadership levels x 2
  networks). The inserts are identical across weeks in the Master, so one
  translated set covers every week.
- hq_message_inserts gains a language column; the unique key becomes
  (message_id, network, role, language).
- Resolution order per the framework §14: her profile language if an approved
  translation exists, otherwise the approved English default. The greeting
  follows too ("Chère Zalwango," / "Dear Zalwango,") and the date is shown in
  the local numeric format for French.

Portuguese, Arabic and Swahili are not written. The schema links them by
message_id + language, so adding each is a data job with no code change. Say
the word and I prepare them the same way.

## Deploy
1. SQL Editor -> run supabase/migrations/141_monday_only_and_french.sql
   (needs 140 applied first).
2. Drag `app` (v81.8) to both Netlify sites -> hard refresh -> "build v81.8 · db 141".

## Verify
- Today (Sunday): the dashboard shows NO weekly card; My Messages shows it.
- Monday: the card is on the dashboard.
- Set the language to French: headline, message, key thought, THIS WEEK action,
  closing and tagline all in French.

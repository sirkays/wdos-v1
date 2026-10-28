# PHASE 185 - Real message text, all messages in one place, #/me retired
Build v81.6 · db 139 · 12 Sep 2026 (app + ONE migration: 139_inspiration_bodies.sql)

Azeez, from Grace's dashboard: retire #/me and move its features onto the
leader dashboard and sidebar; remove the network quote beside the welcome
band; make the inspiration message a bit more detailed but not long; remove
"All my messages" - leaders should see all their messages at once.

## 1. The messages now have something to say
The 52 weekly and 12 monthly messages carried a title and nothing else, which
is why the card looked thin. Migration 139 writes a body for all 64: two or
three sentences each, written to be read on a phone between meetings, in
WODDI's own voice and matched to each existing title (nothing was renamed).
HQ edits any of them in Content Studio. my_message_stream() also now returns
the full body for every message, not only the one on top.

## 2. Everything readable where it stands
The card shows the lead message in full - name, message, body, signed WODDI
HQ - and any other message for this week (the monthly one, a birthday) is
printed underneath in full rather than as a link. "All my messages" is gone,
along with every link into #/me.

## 3. #/me is retired
New sidebar entries under My Profile: **My Messages** (#/my/messages) and
**Inspiration Library** (#/my/learning). #/my/messages shows the HQ message
card plus the whole personal notice feed - journey days, nudges, birthdays,
anything HQ sent - each in full, newest first, marked read as they are shown.
Old links do not break: #/me redirects to the dashboard, #/me/journey to
onboarding, #/me/learn to messages, #/me/profile to the profile page. The
"phone view" link in the account menu is gone.
Still to move out of me.js if you want #/me deleted entirely rather than
redirected: the date-of-birth field and the per-kind notification switches,
which currently live only on that page. Say the word and they go into
#/my/settings.

## 4. The quote panel is gone
The "Stronger Mothers. Brighter Communities." block beside the welcome band
has been removed, as asked. The network motto still appears in the network
hero on the WGMN and WNNN pages.

## Deploy
1. SQL Editor -> run supabase/migrations/139_inspiration_bodies.sql (needs 137 first).
2. Drag `app` (v81.6) to both Netlify sites -> hard refresh -> "build v81.6 · db 139".

# PHASE 183 - Weekly, Monthly and Birthday messages on the volunteer dashboard
Build v81.1 · db 137 · 11 Sep 2026 (app + ONE migration: 137_message_stream.sql)

Azeez, from the reference design: Weekly Inspiration, Monthly Inspiration and
the Birthday message must appear on the leader's dashboard, never all at once,
each with artwork that changes with the tone of the message; every birthday set
in Settings must actually receive its message; every message must be addressed
to the leader by name and signed by WODDI HQ.

## What was true before
The three messages existed only as notices on #/me, which leaders rarely open.
The dashboard never showed them. Birthdays depended on run_daily_content, which
only fires if the daily job runs; when it does not, nobody is greeted. Weekly
and monthly notices carried a title and no personal address, and nothing was
signed.

## What v81.1 does
**One message at a time (my_message_stream in migration 137).**
Priority: her birthday wins on the day; the monthly message leads on days 1-3
of the month so it is never buried under the weekly one; the weekly message
holds the rest of the month. Whatever is not shown appears underneath as
"Also waiting for you" with the title only, opening the full list on #/me.
So the three are always reachable and never crowd each other.

**Artwork by tone.** engagement_content gains a `tone` column with six values:
celebration, gratitude, courage, calm, growth, purpose. Every weekly and
monthly message is given a tone (explicit where the title carries one -
thank/grace/resilience/grow/purpose - and a rotation otherwise), and HQ can
change any tone from Content Studio. The dashboard paints
/assets/messages/<tone>.svg, so the picture changes with the message. The six
artworks ship inside the app in WODDI magenta and lemon green and are
precached, so they render instantly and offline.

**Birthdays that actually arrive.** The stream function files the birthday
notice itself the first time she opens her dashboard on her birthday, so the
greeting no longer depends on the daily job having run. run_daily_content
still files it for everyone else, and the "not in the last 300 days" guard
means she is greeted exactly once either way. The greeting is only produced
when the Birthday wishes rule is on in Settings, and only for a profile that
has a date of birth (set by the leader on #/me, or by HQ in Accounts).
New `birthday_watch()` gives HQ the list of upcoming birthdays with the date
each greeting was last sent, so a miss is visible rather than silent.

**Personal and signed.** Every message is addressed to her first name ("Grace,
this week's message from WODDI HQ for you") and the full text closes with
"- WODDI HQ". The birthday text names her in the body as well.

## Known content gap (HQ to close, not a code problem)
The 52 weekly titles carry no body text in the content library, so the card
shows the title, the focus line where one exists, and the signature. The 12
monthly messages do have focus lines. Until HQ writes the bodies, "Read full
message" only appears where there is something to read. Content Studio already
edits engagement_content; I can also load bodies in bulk if the Founder
approves the text.

## Deploy
1. Supabase Dashboard -> SQL Editor -> paste supabase/migrations/137_message_stream.sql
   -> Run. Badge should then read db 137.
2. Drag `app` (v81.1) to both Netlify sites -> hard refresh -> "build v81.1 · db 137".
No Edge Function change.

# PHASE 184 - Onboarding is a progression, not a set of ticks
Build v81.2 · db 138 · 12 Sep 2026 (app + ONE migration: 138_onboarding_reader.sql)

Azeez: leaders must actually read the listed documents. Replace the checkboxes
with a progression that shows Next, marks the step finished when the document
is done, and lifts the workspace gate when everything is complete.

## Before
Ten checkboxes on one page. A leader could tick all ten in four seconds without
opening anything, and the gate opened as soon as the single step 'pack' was
ticked. HQ's record said "done" and meant nothing.

## Now
**One step at a time.** #/my/onboarding shows step N of 10 with a progress bar
and a row of numbered dots. Finishing a step redraws the page on the next one.

**The document opens inside the step.** Reading steps (role, leadership pack,
code of conduct, safeguarding, confidentiality, communication protocol) embed
the document in a scroller. Next stays disabled until two things are true: the
leader has scrolled to the end of that document, and a minimum time has passed
(45-90 seconds depending on the document, capped at 90). The button counts down
so it never looks broken. An "Open in a new tab" link is there for anyone who
prefers it, but the in-page read is what satisfies the step.

**Steps done elsewhere.** Reporting line, reporting templates and the 30/60/90
plan open the WDOS page they belong to; the step can only be confirmed after
the page has been opened. The Conflict-of-Interest step takes a written
declaration ("none" is a valid answer) which is stored on the record.

**The evidence is stored, and the server enforces it.**
complete_onboarding_step() records seconds spent and whether the end was
reached, and REFUSES a reading step that arrives without that evidence, so a
crafted request cannot skip the document. onboarding_progress now carries
seconds_spent, reached_end and mode; onboarding_evidence(pid) gives HQ the
whole picture per leader.

**The gate.** It now lifts only when every required step is finished
(onboarding_gate_open, and the same rule in the app). Until then the leader
keeps the open pages she has today: home, onboarding, profile, documents,
templates, support, settings.

### The consequence, stated plainly
Every leader who ticked her way through under the old rule keeps those ticks -
nothing is deleted - but any leader with unfinished required steps is now
gated until she finishes them. That is the point of the change, and it will
generate questions in the first week. If HQ wants a grace period instead, say
so and I will make the gate date-based.

## Deploy
1. Supabase Dashboard -> SQL Editor -> paste supabase/migrations/138_onboarding_reader.sql -> Run.
2. Drag `app` (v81.2) to both Netlify sites -> hard refresh -> "build v81.2 · db 138".

## v81.3 - the document showed as a grey broken-document box
Zalwango Grace's screenshot on v81.2: step 1 rendered, but the document area
was an empty grey panel. Two causes, both mine:
1. The reader used an iframe, and the site's Content-Security-Policy lists
   frame-src explicitly (Supabase, Jitsi, Drive) WITHOUT 'self', so the
   browser refused to frame our own page. Nothing was logged on screen; the
   iframe just stayed blank.
2. Even when framed, the scroll position lives inside the iframe, so
   "reached the end" could only be guessed from a height hack.
Fix: the document is now FETCHED and rendered inside our own scroller as
ordinary page content (scripts, styles and frames stripped). Scroll tracking
is exact, the typography is WODDI's, and there is no frame to be blocked.
If a document still fails to load, the step says so, offers the new-tab link
and unlocks Next rather than trapping the leader behind a broken file.
Also: frame-src now includes 'self' in netlify.toml, and the three content
documents are precached so the reader works offline.
Badge "build v81.3 · db 138".

## v81.4 - the Leadership Manual was unreadable
On v81.3 the document loaded but read as a wall of text: whole sections in one
paragraph, and three tables flattened into prose ("Programme What it does WGMN
A transformational community network equipping women and mothers with Good
Mother Network knowledge..." - the table's two columns interleaved line by
line). This was NOT the reader: content/leadership-manual.html has been that
way since it was converted from the PDF. Eleven blocks for the whole manual,
eight of them enormous, three carrying flattened column text.

Rewritten: content/leadership-manual.html now has a title block, numbered
section headings, sub-headings, short paragraphs, bulleted lists, five real
tables (programme family, the four WGMN pillars, the four WNNN pillars, the
four leadership levels, the leadership spine) and highlighted notes. Every
word of the original is kept; only the structure was restored. The reader's
typography was extended to match (magenta section headings, lemon-marked
sub-headings, striped tables, a highlighted note style).

code-of-conduct.html and volunteer-agreement.html were checked and are clean:
102 and 12 properly separated blocks, no flattened columns.
Badge "build v81.4 · db 138".

## v81.5 - the weekly message did not show for a leader still onboarding
Azeez, from Grace's dashboard at 2/10: no HQ message. Cause: home() only drew
the message card when the onboarding gate was open, and the gated branch
returns early. So exactly the leaders who most need encouragement - the ones
still working through onboarding - saw nothing. The message is encouragement,
not privileged data: it now shows above the gate notice for everyone.
Also corrected the two pieces of copy left over from the checkbox era: the
gate notice no longer says "read the Volunteer Leadership Pack and tick it
below", and the checklist no longer says "tick each step as you complete it".
Badge "build v81.5 · db 138".

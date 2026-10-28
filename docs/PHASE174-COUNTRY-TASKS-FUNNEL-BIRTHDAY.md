# PHASE 174 - Country table rebuild, funnel data-accuracy fix, Tasks & Follow-Up, birthdays
Build v80.0 · db 135 · 10 Sep 2026

## 1. Region-chart note removed
The muted explanatory line under "Leadership coverage by network and region"
on the HOFCO screen is gone.

## 2. Ngunan's dashboard rebuilt to match the approved reference exactly
country.js was rewritten: gone are the three small bar-chart cards (coverage /
responsiveness / report status) and the long per-state description line that
read as empty space. In their place, one compact table — Unit · [primary
role] · [assistant role] · Report · Tasks · Actions — one row per state, a
coloured dot for each leader's responsiveness, "Vacant" in red where a seat is
empty, drill-down into the level below, and the same colour-dot legend at the
foot as the reference image. In home.js, Attention Required now sits directly
beside My Structure under the tiles — nothing placed between them — matching
the founder's screenshot; Recruitment/Activities/Engagement remain further
down the page as supporting detail. The same rebuilt panel is used by the
HQ #/country/:id page.

## 3. WGMN / WNNN "inaccurate data" — the real bug, found and fixed
central_admin()'s two recruitment funnels (funnel_online, funnel_referral)
never filtered by network at all: calling the function with 'WGMN' or 'WNNN'
returned IDENTICAL funnel figures both times. Migration 133 adds the missing
network condition to every one of those subqueries (joining to profiles where
the source table has no network column of its own, e.g. referrals). Every
other section of central_admin (countries, members, reporting) was already
scoped correctly. No other numbers on the WGMN/WNNN pages were found faked or
assumed; they were reading whatever the RPC returned, and the RPC was wrong
for these two funnels only.

## 4. Tasks & Follow-Up (migration 134)
Reviewed first: single-assignee tasks, hierarchy-aware authority, the
transition guard, an automatic status-change activity trail, comments with
mentions, checklists, file attachments and task templates already existed
and are unchanged. Added, and only this:
- Bulk assignment: task_batches + tasks.batch_id. One title/definition, one
  row per recipient, each tracked separately. resolve_bulk_recipients()
  turns "WGMN State Coordinators" into a list; hq_assign_task_bulk() creates
  the batch and every recipient's task, silently skipping anyone outside the
  caller's authority. task_batch_summary() / my_task_batches() give the
  per-recipient breakdown, every count meaningful.
- Completion requirements: submit_response / upload_evidence /
  upload_document, any combination, stored on the task. tasks_guard() now
  blocks a task from reaching awaiting_review or completed until what it
  asked for actually exists (a response typed, or a file in task_files) —
  enforced in the database, not just hidden buttons.
- Follow-Up Tracker: task_followup_tracker() generates Needs Attention / Due
  Soon / Overdue / Returned / Awaiting My Approval / No Activity from task
  data; new sidebar tab.
- Reminder sweep: task_reminder_sweep(), 72h / 24h / due-today / overdue,
  each sent once (task_reminders_sent dedupe table), daily at 06:45, in-app
  message and email.
UI: tasks.js gained the Follow-Up Tracker tab, a "My bulk assignments" card
on Assigned by Me with drill-down into each batch, an "Assign to many people"
toggle on the create form (role/network/country → preview → send), and the
three completion-requirement checkboxes.
NOT done, stated plainly: recurring task generation; hierarchy-following
escalation beyond the existing "leaders over the unit see it" visibility; a
dedicated "type your response" box in the task detail view (today the
database gate's message surfaces as an error if a required response is
missing — functional, not yet polished); document co-editing/versioning
beyond upload-review-reupload; HQ/HOFCO breakdown screens by
country/network/level beyond the Follow-Up Tracker and batch summary.
**Not covered by the automated render harness** — every other change this
turn is; the bulk-assign and Follow-Up Tracker UI needs a live test after
deploy: create a task, toggle "Assign to many", preview and send; open
Follow-Up Tracker; tick a completion requirement and confirm the block
message when nothing has been attached yet.

## 5. Birthdays (migration 135)
Registration form gained a Date of birth field; submit_volunteer_reg stores
it and carries it onto the new profile exactly as country/state/locale
already are. hq_set_birth_date() lets HQ record a date for an existing
leader from Accounts. The birthday-greeting automation (built earlier) will
now be able to fire for anyone who registers from here on; existing leaders
still need their dates entered by HQ (a bulk import is the natural next step
once HQ has the dates in one place).

## Deploy
Run 133, 134, 135 in order; drag `app` (v80.0) → badge v80.0 · db 135.

# PHASE 202 - The bug that blocked every activation, and why it hid
Build v83.6 · db 154 · 18 Sep 2026 (app + ONE migration: 154_guard_bypass_and_error_log.sql)

## Root cause, found by reading the original schema
Since Phase 1 a trigger on profiles (profiles_guard) refuses any change to
network or org unit made by a non-HQ person on her own profile: "You may only
edit your contact details". Starting an activation sets the candidate's
network and place from the form, under her own session. The guard refused it
every time, from the first build of the referral route to today. Every
retry, fallback and self-heal I added called the same function and hit the
same wall, and the failure was caught and swallowed, which is why the screen
only ever said "No activation in progress". That silence is my fault.

## Fix
- System code (activation_begin_for) sets a transaction flag the guard
  honours, so it can set her place and network; her own edits from the
  profile page are still guarded as before.
- Nothing is swallowed any more: every failure is written to
  activation_errors with the exact database message, and the message is
  shown on the candidate's screen and, for the last 30, on the HQ
  Activation & Readiness page under "Activation errors".
- Migration 154 creates the activation for every referral registration that
  still has none, then prints the error log and the list of registrations
  with their activation status.

## Deploy
1. SQL Editor -> 154_guard_bypass_and_error_log.sql (after 153). Send me
   the two lists it prints.
2. Drag `app` (v83.6) to both sites -> badge "build v83.6 · db 154".
3. Adelabu and the other test accounts: sign in -> Day 1. New test: private
   window, #/join/WGMN, fresh email -> Day 1.

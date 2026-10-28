# PHASE 199 - Two referral forms, no age rule, photo fix, sign-up that cannot hang
Build v83.3 · db 151 · 18 Sep 2026 (app + ONE migration: 151_two_network_forms.sql)

## From the Founder's message of 17 Sep
Two separate referral forms, one per network, never merged:
- WGMN Referral Form: woddicrm.org/#/join/WGMN  (WGMN journey)
- WNNN Referral Form: woddicrm.org/#/join/WNNN  (WNNN journey)
Each opens with its own rounded logo (the files she supplied, framed in a
white disc with a magenta ring), the WODDI wordmark and the language chips.
The network comes from the form she opened; there is no network choice on
the form, and the earlier single link (WODDI) is paused, not deleted.
Both forms appear on the HQ Activation & Readiness page with their own
visits, registrations, in progress and completed, Copy, WhatsApp and Pause;
and on every leader's My Referrals page.

## From Azeez's screenshots
- "Your age decides your network" line removed. Age is not a criterion for
  either network: no hint, no match/mismatch line, no age gate.
- Broken photo preview: the site's Content Security Policy did not allow
  blob: images, so the browser refused the preview. Fixed twice over: the
  preview now uses a data URL, and blob: is added to the policy. The photo
  is also resized on the phone to 640px before upload, so a 5 MB camera
  picture becomes ~60 KB and cannot stall the sign-up.
- Sign-up spinning for minutes: the flow now shows each step as it happens
  (creating your account, signing you in, opening your activation, saving
  your photograph, opening Day 1), every step has a timeout with a plain
  message, and if the activation step is slow the form is kept and finished
  the moment Day 1 opens. If the email already has an account (which is what
  happens when the HQ address is used for a test), the form says so instead
  of trying to sign in with the wrong password.
  Test with an email that has never been used in WDOS.

## HQ readiness checks (Founder items 3 and 4)
- New block on Activation & Readiness, "Existing users: dashboard access":
  leaders on record, leaders without a login, leaders without a seat, seated
  people without the leader flag, and leaders who have never signed in, with
  a name-by-name list of anyone who needs attention. This is the list to
  work through before Mfon and Regina start calling.

## Deploy
1. SQL Editor -> 151_two_network_forms.sql (after 150).
2. Drag `app` (v83.3) to both sites -> badge "build v83.3 · db 151".
3. Test both forms on a phone with two fresh email addresses, one per
   network, through Day 3 and the assessment; then open Activation &
   Readiness as HQ and confirm both appear under the right form.

## Still outstanding (say this plainly to the Founder)
- Automated candidate emails ("Your Day 2 is ready", "Your assessment was
  received", outcome messages): the approved wording is loaded in
  activation_messages but NOT wired to the mailer. In-app notices, statuses
  and instructions all display; email does not go out.
- The African Leadership Structure document is a separate task (the register
  work), not part of this build.
- Anyone in the "Existing users" list needs a human decision (create login,
  seat, or remove the flag). The list shows who; it does not fix them.

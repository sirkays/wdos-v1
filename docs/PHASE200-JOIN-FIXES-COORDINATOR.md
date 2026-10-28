# PHASE 200 - Wrong account after sign-up, wrong coordinator, and four form changes
Build v83.4 · db 152 · 18 Sep 2026 (app + ONE migration: 152_coordinator_never_hq_seat.sql)

## "Who is Tobi Ajayi?"
The browser already held a signed-in session (Tobi's) when the form was
submitted, and that session survived into the reload, so the page opened as
Tobi with no activation. Two guards now make that impossible:
- Opening a referral form signs out whoever is signed in on that browser
  first. The form always starts from a clean session.
- After sign-in the form checks that the signed-in email is the email typed
  on the form; if not, it signs out again and says so.
And the activation page, when there is genuinely no activation, now offers
the two form buttons instead of "use the link you were sent".

## "Who is Patience Opega?"
A data fault the coordinator lookup exposed: a Country Representative seat
is parked on the headquarters unit itself instead of on a country. The
lookup walks a member's line up to the root and took that seat. Migration
152 makes the lookup ignore the headquarters level, and its last query lists
every leadership seat parked at HQ so you can move them to the right
country (Accounts -> open the person -> seat). Until they are moved they are
wrong in the structure, not only on this card.

## Form changes
- Preferred language: a dropdown of the eight languages under date of birth;
  saved to her profile so WDOS opens in it. The chips at the top still
  switch the form itself.
- Password fields have an eye button that reveals the password.
- Dark mode: a Light/Dark button beside the language chips on the form, and
  a Theme button in every volunteer leader's header (HQ already had one).

## Deploy
1. SQL Editor -> 152_coordinator_never_hq_seat.sql (after 151). Read the
   rows it prints and correct each seat.
2. Drag `app` (v83.4) to both sites -> badge "build v83.4 · db 152".
3. Close every WDOS tab, open #/join/WGMN in a private window, register with
   a fresh email, and you must land on Day 1 as that person.

# PHASE 201 - The activation is created at sign-up, and the gate holds
Build v83.5 · db 153 · 18 Sep 2026 (app + ONE migration: 153_activation_at_signup.sql)

## What went wrong (Adelabu Rose on a phone)
The account and the session were created by the sign-up itself. The
activation was created by a SECOND call from the phone afterwards. On a slow
connection that second call timed out or never ran. Result: a real account
with no activation, status "applicant", no country, and because the gate
keyed on the activation existing, the full member dashboard opened. The
coordinator card then had no line to walk (no country), so it said none.

## The fix, in three layers
1. The referral form now travels INSIDE the sign-up (as account metadata).
   A database trigger creates the activation the instant the profile row is
   created. There is no second call to fail. Country, state, LGA, community
   cluster, position, phone, language and date of birth are all set by the
   database at that moment.
2. The gate no longer depends on the activation existing. Anyone with no seat
   who is an applicant, or came through a referral form, or has an
   activation not yet marked selected, sees only her activation, profile,
   settings, help and sign-out. Nothing else opens until HQ selects her and
   the appointment process seats her.
3. The activation page, if it ever finds a referred person without an
   activation, creates it from her own record (the referral code is stored
   on her profile), and the form data kept on her phone.
Migration 153 also creates the missing activation for every person who
already registered through a referral form without one (Adelabu included),
and prints two confirmation lists: the country-level seats for Nigeria and
HQ, and every referral registration with its activation status.

## The coordinator
The card walks her line: community cluster -> LGA -> state -> country ->
network. Once her place is set (which the sign-up now does) a Nigerian
candidate sees the Country Representative seated on the Nigeria unit. The
first list printed by 153 shows exactly who is seated there today; if the
Country Representative for Nigeria is not on the Nigeria unit in that list,
that is the seat to correct in Accounts. Seats parked on WODDI HQ are
ignored by the lookup since 152.

## Also
- Phone header: the long system title no longer overlaps the network name.

## Deploy
1. SQL Editor -> 153_activation_at_signup.sql (after 152). Read the two lists.
2. Drag `app` (v83.5) to both sites -> badge "build v83.5 · db 153".
3. Adelabu: sign in again -> she must land on Day 1 with only her activation
   in the menu. New test: private window, #/join/WGMN, fresh email -> Day 1.

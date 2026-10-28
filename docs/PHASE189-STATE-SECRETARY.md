# PHASE 189 - State Secretary role, and the first one: Chukwuemeka Okwah (Imo)
Build v82.0 · db 144 · 16 Sep 2026 (app + TWO migrations, run separately)

Azeez: create a WDOS account for Chukwuemeka Okwah, Secretary WGMN Imo State,
with oversight of the whole Imo structure (all LGAs and chapters) and the
ability to message every Imo leadership structure.

## The role
- 143: adds 'state_secretary' to the role_code enum. MUST run alone, first.
- 144: seats it in position_master at state_region level (rank 3, beside the
  Coordinator and Assistant), adds the titles ("State Secretary" in WGMN,
  "State or Regional Secretary" in WNNN), gives it the Assistant's weekly
  ACT line and monthly role lens, and lists it in Accounts.
- Scope comes from the seat, not the title: a state-level seat sees and
  messages everything under that state. So Imo LGAs, clusters and chapters
  are his catchment automatically.

## The account
Created in 144 by SQL, the same way HQ's Accounts screen would:
auth user (email confirmed), identity, profile (WGMN, Nigeria, Imo,
is_leader), lifecycle status walked to activated, and one open seat
state_secretary @ Imo. Re-runnable: a second run resets the password and
leaves everything else as is.
The temporary password is printed inside 144 next to his email. He signs in
at woddicrm.org with it and changes it under Settings. Delete that line from
your copy once he has it.
His photograph: Accounts -> open him -> upload.

## Deploy, in this exact order
1. SQL Editor: paste 143_state_secretary_role.sql alone -> Run.
2. SQL Editor: new tab, paste 144_... -> Run. The confirm query at the end
   should return one row: Chukwuemeka Okwah, is_leader true, state_secretary,
   Imo.
3. Drag `app` (v82.0) to both sites -> badge "build v82.0 · db 144".

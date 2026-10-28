# PHASE 149 - CR/DCR contact list, My Country dashboard, bulk logins, header wordmark
Build v71.0 · db 117 · 9 Sep 2026

## Contact list (the founder's CR/DCR Contact Master List)
Migration 117 loads the 35 black rows (emails and phones). Red rows are excluded on
instruction: Congo CR, Morocco CR, Rwanda CR and DCR, Senegal DCR, Tunisia CR and DCR,
and the red vacant seats. Accounts → "Load CR/DCR contact list" matches each row to
the person already in WDOS (login or directory), fills a missing email or phone on
the directory row, and adds anyone not yet present (Chad DCR Tchindebe Antoinette
Fanone, Uganda DCR Mundrua Margaret, Nigeria DCR Maureen Nkechi Chukwuemeka,
Cameroon Regional Coordinator Blessing Vinyoh, and any other new name). Ghana's CR
(Serwaa Brakatu) has a phone but no email in the list, so no login can be created
for her until an email is known.

## Temporary passwords for all existing leaders
Accounts → "Create logins for all leaders without one": creates a login for every
directory leader with an email and no login, links the directory row, seats her
from her recorded position and country/state (CR → Country Representative at the
country unit, and so on), and opens ONE printable sheet: name, position, country,
seat, email, temporary password, with a Print / Save as PDF button. The sheet is the
only copy; WDOS never stores a password; each leader changes it under Settings after
her first sign-in. People who registered through the form and go through activation
are not touched (they are not directory rows).

## My Country (Country Representatives, and any seated leader for her own scope)
Sidebar → My Leadership Structure → My Country. Coverage by position (chart),
responsiveness of every leader (seen this week / 8 to 30 days / longer / never,
chart), monthly report status per state (chart), then the structure below the seat:
each state with seats filled, members, tasks (and overdue), activities in 30 days,
its monthly report status with an Open Report link, and every leader with a colour
dot for responsiveness, last-seen date and a Message button (opens the thread).
"Open (n below)" drills into LGAs, clusters and chapters with the same view.

## Header and login
The magenta banner is replaced by a header wordmark: "WODDI Good Mother Network
WGMN" in magenta, or "WODDI Nurture NextGen Network WNNN" in lemon green, where the
red arrow pointed. The login page carries the same five-language bar as the doors.

## Deploy
Run 117_contacts_country_dashboard.sql; drag `app` to both Netlify sites → badge
v71.0 · db 117. Then Accounts → Load CR/DCR contact list → Create logins for all
leaders without one → Print / Save as PDF.

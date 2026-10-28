# WDOS Role-Based Access: who sees what
Version 1.0 · 18 Sep 2026 · applies from build v83.7

Access in WDOS follows two things: the person's STANDING (candidate, member,
volunteer leader, HQ) and, for leaders, the SEAT she holds (its level and
its place). Nothing is decided by title alone. This document states, for
each standing, what appears in the sidebar, what she can do, and what is
captured for HQ. It is the reference for testing and for any future change.

## 1. Referral candidate (came through the WGMN or WNNN referral form)
Standing: no seat, is_leader false, an activation not yet marked "selected".
Sidebar (only these):
- Referral Activation  -> #/activation
- My Profile           -> #/my/profile (contact details, photograph, language)
- Support              -> #/my/support
- Settings             -> #/my/settings
- Sign out
Plus a note: "Your dashboard opens after your activation is complete and
headquarters confirms your appointment."
Any other address (Home, Referrals, Meetings, Members, anything) redirects to
#/activation. There are no operational modules, no member counts, no
referral link, no meetings, no tasks.
What she can do: read Day 1 to Day 3, answer, acknowledge, complete the
assessment, request an extension, edit her own contact details.
Captured for HQ: everything from the form (network, position, country, state,
LGA, community cluster, phone, language, date of birth, photograph), every
day's answers and acknowledgements with time spent, the assessment, the
outcome, and any error that occurred while starting her activation.
Exit from this standing: HQ records "selected" AND the appointment process
seats her. Only then does she become a volunteer leader.

## 2. Community member (registered directly, not through a referral form)
Standing: no seat, status not "applicant", no referral code.
Sidebar: Home, Priority Actions, My Network, Learning, Messages, My Profile,
Support, Settings. No recruitment, no meetings scheduling, no members lists.
What she sees: her chapter line, her coordinator, the weekly and monthly
messages, learning assigned to her.

## 3. Volunteer leader (holds an active seat)
Standing: is_leader true, one open seat with a level and a place.
Sidebar: Dashboard (Home, Country/State/Chapter overview as her level allows,
Alerts, Priority Actions, Performance), My Leadership Structure, Recruitment
(Referrals with the two referral forms; Candidates, Screening, 7-Day
Activation and Selected Candidates only where the seat's module grants it),
Tasks & Follow-up, Meetings, Programmes & Activities, Reports, WODDI
Institute, Members, Communications, Resources, Support, Settings.
Reach: her seat's place and everything below it, never above and never
sideways. A State Coordinator sees her state's LGAs and chapters; a Country
Representative sees her country; an Assistant sees what her principal's
unit covers but acts only within written delegation.
Gate: until she has completed onboarding (read the Leadership Pack and
acknowledged it) the operational items are locked and show why.

## 4. HQ functions (Founder, HOFCO, Secretary, Administration, Programmes,
##    Communications, Finance, IT, QA)
Standing: hq_function set on the profile.
Sidebar: the function's own list from assets/hq-sidebars.json (each function
has its own set; the Founder's is the widest). Every HQ function has
Activation & Readiness, where the two referral forms, the candidate register,
the ranking, the error log and the existing-users check live.
Reach: every country, limited by function (Safeguarding never sees case
detail on a dashboard; Finance sees approved expenditure only).

## 5. What is deliberately NOT visible to anyone below HQ
- Another person's contact details outside her own line.
- Assessment scores, reviewer comments and rankings (candidates never see
  them; leaders never see them for candidates).
- Safeguarding and complaint records.
- The activation error log.

## 6. How to test a standing
Sign in as a person of that standing, open every address in the sidebar,
then type an address from a higher standing into the browser (for example a
candidate typing #/my/referrals). The higher address must redirect or show a
locked notice, never content.

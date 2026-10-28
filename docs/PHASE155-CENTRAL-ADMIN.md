# PHASE 155 - WDOS Central Admin · WODDI HQ Command Centre
Build v72.0 · db 121 · 9 Sep 2026
Built to the founder's "WDOS Central Admin" document and picture. Brand colours only.

## The HQ homepage (#/ for HQ roles)
One screen answering: what is happening, what is wrong, what requires my decision,
what must happen next. Every number comes from central_admin() (migration 121),
computed by the same rules as the module screens:
- Eight overview tiles: countries represented / needing strengthening / not yet
  represented, active leaders, vacant positions, reports due, approval requests,
  programme events. A strip beneath gives members (WGMN / WNNN) and positions
  filled of total. A network switch (All / WGMN / WNNN) recomputes the page.
- Immediate attention: overdue tasks, missing reports, vacant CR/DCR roles,
  activation pending, safeguarding alerts, system alerts (technical tickets),
  countries requiring attention, escalations; each opens its screen.
- Recruitment funnel: Referred → Contacted → Screened → Activation → Selected →
  Appointment pending → Appointed, from referrals, applications, journeys, seats.
- Africa coverage map: 54 countries coloured represented / needs strengthening /
  not represented; tooltip with leaders and members; click opens the structure.
  Rule: represented = CR and DCR seated and at least half the seats filled;
  needs strengthening = some leaders but that bar not met; otherwise not yet.
- Leadership structure ladder: HQ → CR → DCR → State → Assistant → LGA → ... with
  filled / seats per position.
- Country performance: country, CR, coverage %, report status, programmes, gaps,
  status (Strong / Developing / Not represented).
- Approvals centre: pending appointment acceptances, applications awaiting
  decision, reports awaiting review, replacement requests (declined seats),
  escalations. Programme requests join once the programme approval workflow exists.
- Reporting & accountability: submitted % donut, on time / late / overdue bars,
  evidence files.
- Role-based access: the roles and their scope, with holder counts, and Manage.
The previous HQ dashboard remains at #/dashboard.

## Central Admin sidebar (22 items, in the founder's order)
Command Centre · People · Networks · Countries · Leadership Structure · Recruitment
& Activation · Appointments · Tasks & Follow-Up · Meetings · Reports &
Accountability · Programmes & Activities · Institute & Community · Engagement &
Recognition · Communications · Safeguarding & Complaints · Helpdesk · Resources &
Policies · Approvals · Analytics · HQ Intervention · Data & Compliance · System
Administration, followed by Messages, Meeting Room, Referral Links, Content Studio,
Ask WODDI. Each opens the existing screen holding that function; the dead-link
check covers both sidebars (136 links, 0 dead).

## Not changed
No existing functionality was removed or altered. The Founder / HOFCO / Secretary /
Programmes / IT / Communications role-specific homepages the document describes
are the next step and will reuse these panels with different ordering and scope.

## Deploy
Run 121_central_admin_bundle.sql; drag `app` to both Netlify sites → badge
v72.0 · db 121. Sign in as HQ: the Command Centre is the first screen.

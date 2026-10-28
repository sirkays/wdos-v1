# PHASE 179 - Profile pictures via Google Drive on attention items; network hero fixed
Build v80.6 · db 136 · 10 Sep 2026 (app only, no migration)

## Bug found from Regina's WNNN screenshot (v80.5)
The network hero band (WGMN/WNNN title, motto, mini map, six tiles, and the
new logo from v80.5) never appeared at the top of #/network/:net. Cause in
networkhq.js: the hero was appended to the outlet AFTER the body element that
holds the rest of the page, so it rendered at the very bottom, below Recent
activity, where nobody scrolled. Fixed: hero inserted before the body. The
logos are therefore visible only from v80.6, not v80.5.

## Profile pictures via Google Drive
Attention items only carry the person's name (the hofco_dashboard payload
has no profile id), so pictures are resolved by name against the HQ Drive
photo map already used for the leader dashboard, header and Accounts
(assets/leader-photos.json, core/photos.js). New driveAvatarByName(name):
shows initials immediately, swaps to the Drive thumbnail once the name
matches (exact normalised name, or two matching name words). Unmatched
names stay as initials — no picture is ever invented.

Where it shows: the network pages' Attention required list, the nine HQ
role homes' Attention required list, and the Owner column of the HOFCO
Attention required table. Only person-type issues get a picture
(inactive CR, overdue task, stalled activation, appointment pending,
engagement declining, support request); unit-type issues (vacant seat,
report overdue, red issue) do not.

Still true: this depends on the HQ Drive folder being shared "Anyone with
the link: Viewer", and leaders not in that folder show initials. That is
the data gap discussed earlier (photo submit + HQ approval, or a re-run of
Import photos for the newer leaders), not something this phase changes.

netlify.toml CSP img-src now lists drive.google.com and *.googleusercontent.com
(only matters if the toml is ever deployed).

Deploy: drag `app` (v80.6) to both Netlify sites → badge "build v80.6 · db 136".

## v80.7 - "NaN Countries operational" on the network hero
Regina's WGMN screenshot (v80.6, the band now at the top): first tile read
"NaN". Cause: heroTile() ran every value through Number() before
formatting, and the first tile's value is the text "3 / 54" (represented +
needing strengthening out of 54), which Number() cannot parse. Fix: strings
are shown as given; only numeric values are formatted. Nothing else changed.
Badge "build v80.7 · db 136".

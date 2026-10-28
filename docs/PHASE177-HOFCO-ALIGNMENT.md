# PHASE 177 - HOFCO Dashboard alignment
Build v80.3 → v80.4 · db 136 · 10 Sep 2026 (app only, no migration)

## What was wrong (from Regina's screenshots on v80.2)
1. Attention Required was an 8-column table placed in one third of the page.
   Every cell wrapped word by word ("Suppo rt reques t", "Hi g h", "Op en"),
   the card ran to 12 rows and the two neighbouring cards ended long before
   it, leaving a large empty block on the right.
2. The country performance table (8 columns) sat in the narrow 2/5 column
   beside the network comparison, so it wrapped the same way ("Draf t",
   "100 %") and left the left side empty once the shorter card ended.
3. Phase 176 set align-items: start on the row grids, which stopped cards
   stretching but exposed the holes instead of removing them.

## What changed (js/pages/hofco.js, assets/css/wdos.css, locales)
Rows now pair cards of similar height and give wide tables the full width:
- Row 2  Attention required (full width). Heading is "Attention required"
  with a red count pill; only the first 6 items show; the button reads
  "View all 114" and a link under the table says "108 more on the full
  list." Key columns no longer wrap (Issue and Owner may wrap, capped).
- Row 3  My work queue (two columns of items) | Quick actions (two-column
  button grid). Same row height.
- Row 4  WGMN & WNNN performance | Leadership coverage by region.
- Row 5  Country performance (full width, 12 rows, no cell wrapping).
- Row 6  Engagement | Reporting | Activities (unchanged).
- Row 7  Country status map | Recent network activity.
- New CSS: .ca-grid--eq (paired rows share one height), .hf-count,
  .hf-table (nowrap), .hf-queue, .hf-quick--grid. Existing .ca-grid--2 /
  .ca-grid--3 untouched, so the other HQ role homes are unaffected.
- Locale keys added: hf.attentionShort, hf.viewAllN (en + fr).

## Deploy
Drag `app` (v80.3) to both Netlify sites → hard refresh → badge
"build v80.3 · db 136". No SQL to run.

## Phase 177b (v80.4) - the same rules on every dashboard
Azeez: "the alignment must reflect across all the dashboards including the
volunteer leadership dashboards." Applied:
- Global: .ca-grid and .vs-grid rows stretch again, and every card in a row
  is a flex column, so cards in the same row always share one bottom edge
  (no holes). Wide tables are given full-width rows instead, so stretching
  no longer produces the tall-card-with-empty-neighbours effect.
- Global: .ca-table cells no longer wrap (horizontal scroll inside the
  card on narrow screens instead of "Draf t"); long free-text cells opt in
  with .hf-td-wrap.
- HOFCO: WGMN / WNNN hero panels now equal halves (were 3:2).
- Nine HQ role homes (rolehome.js): Attention required 6 rows + count pill
  + "View all N"; Attention | Work queue and Performance | Recent activity
  as equal halves; Quick actions two-column grid.
- Command Centre (central.js): 7-column country performance table moved to
  its own full-width row; Ladder | Approvals and Reporting | Access as
  equal halves.
- WGMN / WNNN pages (networkhq.js): Attention | Funnel equal halves,
  count pill, country table nowrap.
- Country Representative / Country Lead home (home.js countryHome, the
  founder-approved Screen 2): Attention required (6 rows, count pill,
  "View all N") beside My Structure kept as approved, but the structure
  card now takes the wider column (2:3) because its table has 5-6 columns,
  and its table scrolls inside the card (max 420px, sticky header) so the
  two cards stay level however many states a country has. Delegated
  Portfolio table nowrap with the assignment title allowed to wrap.
- Chapter Coordinator / Chapter Lead home (Screen 3) is a single stacked
  column by design (mobile-first); unchanged.
- Engagement page: By country | By level equal halves.
- Locale keys added: cr.attentionShort (en + fr).

Deploy: drag `app` (v80.4) to both Netlify sites → badge "build v80.4 · db 136". No SQL.

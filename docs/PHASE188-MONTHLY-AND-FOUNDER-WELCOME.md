# PHASE 188 - Monthly Leadership Inspiration + the Founder's Welcome
Build v81.9 · db 142 · 13 Sep 2026 (app + ONE migration: 142_monthly_and_founder_welcome.sql)

Built to the two documents: the Five-Year Monthly Leadership Inspiration
Content Master (Gracewell & Azeez) and the Founder's Welcome & Appreciation
Message Implementation Brief (Azeez & Praise). Both run on the Phase 186
messaging engine, so delivery logging, duplicate prevention and the language
fallback are shared rather than rebuilt.

## A. Monthly Leadership Inspiration
- **All 60 months loaded**, word for word: theme title, core message, WGMN
  lens, WNNN lens and reflection prompt (Master §13). The old title-only
  monthly content is deleted.
- **Role lens** for all 10 leadership levels in both networks (§6), stored
  separately and appended at delivery from the leader's ACTIVE verified
  appointment, never from a stored former role (§7).
- **Card assembly** exactly as §8: Dear {{FirstName}}, month title, core
  message, network lens, role lens, reflection question, "With appreciation,
  WODDI HQ."
- **First Wednesday of the month**, then visible for the whole month, then the
  archive (§2, §10). The month is computed, so it never collides with Monday's
  weekly card.
- **One push per person** even with several appointments: the primary seat is
  used (§11). Delivery is logged to hq_message_delivery on the 'monthly'
  channel, so a duplicate cannot be created by a retry.
- **Language**: her approved language if a translation exists, English
  otherwise (§9). English is loaded; French, Portuguese, Arabic and Swahili
  are data jobs against the same content_id.
- 60 theme graphics ship in the app, one per month, colour-coded by the
  five-year arc. HQ can replace any image without touching the content_id.

## B. The Founder's Welcome & Appreciation Message
- Shown **once, on first login after appointment**, at the top of HOME, with
  the Founder's photograph, her name and role, the message in short
  paragraphs, and a single "Continue to my dashboard" button (Brief §7, §8).
- **Tied to the appointment, not the person** (§10): first-view is recorded
  against profile + role + org unit, so a leader who changes role receives the
  welcome for the new role and never the old one again.
- Personalisation fields per §4: {{FirstName}} {{NetworkName}} {{RoleTitle}}
  {{Country}} {{JurisdictionName}}. WNNN uses Lead titles, WGMN uses
  Representative/Coordinator titles (§5).
- Seven role levels x two networks = 14 controlled records with content_id,
  version and active flag (§11).

### IMPORTANT - the welcome text is NOT published
The brief says the role-by-role library "will follow" and that only
HQ-approved text may be published. I have drafted all 14 messages to the
brief's specification (140-180 words, all eight required elements, no
reporting or compliance language), but every record is stored with
is_active = false, so NOTHING appears under the Founder's name until she
approves it. The feature is live and shows nothing until then.
To read them for approval:
  select network, role_level, body from public.founder_welcome order by network, role_level;
To publish after approval:
  update public.founder_welcome set is_active = true;
Or replace any body first:
  update public.founder_welcome set body = '<approved text>' where content_id = 'FW-WGMN-COUNTRY-EN';

## Not built (honest list)
- HQ authoring/approval screens for either feature (tables and statuses exist).
- Timezone-aware 9:00 local release (§2) and the mid-month entry rules for
  someone appointed after the 20th (§7) - today the card simply appears from
  the first Wednesday onward, which satisfies the visible behaviour but not
  the push timing.
- Founder photograph: the card points at /assets/founder.jpg. Drop the
  approved photograph there or change founder_image per record.
- Monthly content in languages other than English.

## Deploy
1. SQL Editor -> run supabase/migrations/142_monthly_and_founder_welcome.sql
   (needs 140 and 141 applied).
2. Drag `app` (v81.9) to both Netlify sites -> badge "build v81.9 · db 142".

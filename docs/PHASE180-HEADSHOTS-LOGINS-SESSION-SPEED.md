# PHASE 180 - Bundled headshots · passwords for seated leaders · one session per window · precache
Build v80.8 · db 136 · 10 Sep 2026 (app + admin-users Edge Function; no SQL migration)

## 1. Leader headshots bundled into the app (assets/leaders/)
Azeez uploaded the HQ Drive folder "WODDI CR Professional Headshots" as a zip
(73 files). 61 are pictures; 12 are not (six .docx, five unrelated .pdf, one
.mp4) and were left out. Two "pictures" were PDFs (Murjanatu Yakubu, Katsina;
Ainan Sotibaye, Chad) and two were HEIC (Florence Umutoni, Rwanda; Binta
Coulibaly, Mali) — all four converted, so those earlier gaps are closed.
Each image: EXIF-rotated, square-cropped with a slight upward bias (faces sit
high in a portrait), 360 px JPEG. 1.4 MB for all 61.

assets/leader-photos.json now carries `local` (Drive file id → bundled file)
for 47 of the 50 WDOS leader names, matched by name tokens with spelling
tolerance (Shaibu/Shuaibu, Emunvuon/Emonvuon, Datijjo/Dattijo), plus
`localExtra` (14 pictures whose names are not in the 50-name map; they match
at runtime when a WDOS name shares two name words). Not matched to a WDOS
name: Nwali Esther Ndidi, Chioma Okeoma Okonkwo, Amina Bello (no picture in
the folder carries those names; "Esther Onyeka Ebonyi", "Chioma Nwabiawa
Anambra" and "AMINA PICTURE Centrafrique" exist and may be them — HQ to
confirm, then I link them by hand).

core/photos.js now resolves a person to the bundled file first and falls
back to the Drive thumbnail only when no bundled file exists. Effect: the
leader dashboards, header, Accounts, Atlas and the attention-item avatars
show the photos immediately, from the app itself, with no dependency on
the Drive folder's sharing setting. The bundled files are cached by the
service worker on first use.

## 2. "I couldn't create logins for the seated leaders" — why, and the fix
Command Centre → "Create logins for all listed leaders (one step)" reads
leader_directory WHERE claimed_profile IS NULL. Seated leaders were linked to
their profile on 9 Sep (seat_from_lists / earlier provisioning), so
claimed_profile is set and the button skips them — they already HAVE a
login. WDOS never stores passwords, so there was nothing to hand over.

New: Command Centre → "Temporary passwords for seated leaders (reset)"
(admin-users action bulk_reset_directory). Default: every linked leader who
has never signed in gets a fresh temporary password and appears on the same
grouped sheet (Nigeria SC/ASC first, then Africa CR/DCR). Typing ALL at the
prompt resets every linked leader, including those who already signed in
(their current password stops working — tell them first). The reply shows
issued / failed / skipped-because-already-signed-in counts.

This needs the Edge Function redeployed (same file, one new action):
1. Supabase Dashboard → project vhudbuprjpsyizporkcn → Edge Functions →
   admin-users → Code → replace the editor content with
   supabase/functions/admin-users/index.ts from this zip → Deploy.
2. Secrets unchanged (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY already set).
Until it is redeployed the new button returns "unknown action".

## 3. "It still logs me out" — one session per window
Root cause (matches the Phase 154 log entries storage_set_elsewhere /
storage_removed_elsewhere): the session lived only in localStorage, which
every tab, window and pinned app on the same computer shares. Signing in as
another person in any window (Regina in one, HQ in another, a leader in a
third — the normal testing pattern; the taskbar in the screenshots shows five
browser windows) overwrote it, the other windows announced SIGNED_OUT, and
the Phase 170 backup then "recovered" them as the LAST person who signed in.
That reads as "it logged me out" or "it switched me".

Fix (core/db.js tabStorage): the live session is held per window in
sessionStorage; localStorage keeps a copy only so a NEW window or the pinned
app opens already signed in as the most recent login. A sign-in or sign-out
in another window no longer touches this one. Testing as several people in
several windows of the same browser now works. If a window still gets signed
out, the sign-in page's "Why was I signed out?" panel will now show a
server-side reason (refresh rejected, password changed), not a storage
event — send me that text.

## 4. "WDOS is very slow" — the app now runs from disk
Cause: since v48 the service worker fetched EVERY same-origin file
network-first — 157 files (1.3 MB of JavaScript, 370 KB of locales, CSS,
icons) on every load and every reload, each a round trip to Netlify before
a single screen could render. On an Abuja connection that is seconds of
blank page per load, before any data is even requested.

Fix (sw.js): the complete app is precached at install (generated list, one
entry per file, each fetched fresh with cache:'reload' and stored on its
own so one missing file cannot block the install) and served cache-first.
A release = new sw.js VERSION = a new complete set, then open windows
reload (existing activate handler), so builds can never mix (the v48 blank
came from refreshing files one at a time). app.js also asks for a new build
whenever the window comes back into view. Data requests are untouched
(network-first with offline fallback, cleared on sign-out).

Expected: first load after deploy ≈ same as before (it fills the cache);
every later load and reload opens in well under a second before data.
The dashboard RPC payloads themselves were already trimmed in Phase 176.

## Deploy
1. Drag `app` (v80.8) to both Netlify sites → hard refresh → badge
   "build v80.8 · db 136".
2. Redeploy admin-users as in section 2 (needed only for the reset button).
No SQL.

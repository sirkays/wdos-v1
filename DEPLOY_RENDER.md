# Deploying WDOS to Render (up to ~1000 participants)

Three pieces, all in `render.yaml` (a Render Blueprint):

| Piece | Where it runs | Why |
|---|---|---|
| Website + API (Django, gunicorn) | Render web service `wdos-web` | Pages, login, tokens, admin |
| Interpreter bot (`run_translation_agent`) | Render background worker `wdos-interpreter` | Live captions + spoken translation |
| Database | Render Postgres `wdos-db` | Replaces local SQLite |
| **Video/audio (LiveKit)** | **LiveKit Cloud** (not Render) | Render has no UDP, so it cannot host a media server |
| Speech + translation | Azure AI Speech / Translator | Already used by the code |

## 1. Push the code to GitHub
```powershell
cd c:\Users\atteh\OneDrive\Desktop\workspace\wdos-v1
git init
git add .
git commit -m "WDOS v1: Render deployment"
git branch -M main
git remote add origin https://github.com/sirkays/wdos-v1.git
git push -u origin main
```
`.env` is git-ignored: your keys never go to GitHub.

## 2. LiveKit Cloud (the meeting)
1. Create a project at <https://cloud.livekit.io>. **Plan: Ship or higher.** The free Build plan caps a room at 100 participants.
2. Copy `LIVEKIT_URL` (`wss://...livekit.cloud`), API key and secret.

## 3. Azure (translation)
* Speech + Translator resources in a region near your users (e.g. `southafricanorth` or `westeurope`).
* Azure Speech allows **100 concurrent recognitions** by default. Every unmuted speaker uses one. Request an increase if you expect many simultaneous speakers.

## 4. Render
1. Dashboard > **Env Groups** > New, name **`wdos-secrets`**, add:
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` (optional `AZURE_SPEECH_KEY_2`, `AZURE_TRANSLATOR_KEY_2`).
2. Dashboard > **New > Blueprint** > pick `sirkays/wdos-v1` > Apply.
3. When the first deploy is green, open the **wdos-web > Shell** and create the first data:
   ```bash
   WDOS_SEED_PASSWORD='<a-strong-password>' python manage.py seed_wdos
   ```
   This creates the organisation tree and the demo leader accounts (`admin@thewoddi.org`, ...). **Always set `WDOS_SEED_PASSWORD`** — the default `admin123` is public. Re-running the command resets those passwords.
4. Custom domain: add it in Render, then set `DJANGO_ALLOWED_HOSTS=meet.yourdomain.org` on `wdos-web`.

## Before a 1000-person meeting
* Run a load rehearsal with 100, then 300, then 1000 test joiners (LiveKit CLI: `lk load-test`).
* Check the Render **Metrics** tab during the rehearsal; raise `wdos-web` to `pro` if CPU stays above ~70%.
* Open the room 15 minutes early (the app already allows this) so people trickle in instead of all joining at once.
* Keep audience cameras and microphones off: every participant's browser subscribes to every camera, and the interpreter bot starts one Azure recogniser per open microphone.

## Notes
* Media (meeting files) lives on a 5 GB Render disk mounted at `/var/data`. A service with a disk runs as a single instance (no horizontal scaling; scale up with a bigger plan instead).
* To go multi-instance later, move uploads to S3-compatible storage (`django-storages`).
* Migrations run automatically before every deploy (`preDeployCommand`).


---

## 5. Zoom Meeting SDK & Realtime Integration (Admin Platform Switch)

WDOS supports switching the active video platform between **LiveKit (WODDI Room)** and **Zoom (Meeting SDK 6.10.0)** in **Django Admin → Meetings → Video platform settings**. Each meeting stores its own provider (`Meeting.platform`), so switching never breaks scheduled or live meetings.

### 5.1 Zoom Marketplace Setup
1. **Server-to-Server OAuth App** (for REST API provisioning & webhooks):
   - Create a Server-to-Server OAuth app in the [Zoom App Marketplace](https://marketplace.zoom.us/).
   - Copy **Account ID**, **Client ID**, and **Client Secret** into `ZOOM_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, and `ZOOM_S2S_CLIENT_SECRET`.
   - Enable granular scopes:
     - `meeting:write:meeting:admin` (create meetings)
     - `meeting:read:meeting:admin` (read meetings)
     - `meeting:update:meeting:admin` (update meeting settings)
     - `meeting:delete:meeting:admin` (delete meetings)
     - `meeting:update:status:admin` (end live meetings)
     - `user:read:user:admin` (verify host users)
     - `user:read:token:admin` (fetch host ZAK tokens)
     - `report:read:meeting_participants:admin` / `meeting:read:list_past_participants:admin` (optional participant reports)
     - Optional: `cloud_recording:read:list_recording_files:admin`
2. **Event Subscriptions (Webhooks)** on the same Server-to-Server OAuth app:
   - Point the Event Notification Endpoint URL to: `https://<web-host>/integrations/zoom/webhook/`
   - Copy the **Secret Token** into `ZOOM_WEBHOOK_SECRET_TOKEN`.
   - Subscribe to events:
     - `meeting.started`
     - `meeting.ended`
     - `meeting.participant_joined`
     - `meeting.participant_left`
     - `meeting.deleted`
     - `meeting.updated`
3. **General App (Meeting SDK Enabled)** in the **same Zoom account**:
   - Create a General App in the same Zoom account that owns the host users (this avoids external-account OBF token requirements).
   - Enable **Meeting SDK** and copy its Client ID and Client Secret into `ZOOM_SDK_KEY` and `ZOOM_SDK_SECRET`.
4. **Zoom Account Settings**:
   - Enable **Co-host**.
   - Disable **Allow removed participants to rejoin**.
   - Disable **Embed passcode in invite link for one-click join**.
5. **Host Pool & Licenses**:
   - Add licensed Zoom host users under **Django Admin → Meetings → Zoom host accounts**.
   - Meetings over 100 participants require Business (300) or Large Meetings add-on (500 / 1,000) licenses on the host accounts.

### 5.2 Environment Variables (`wdos-secrets`)
Add the following variables to the `wdos-secrets` environment group in Render:
- `ZOOM_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, `ZOOM_S2S_CLIENT_SECRET`
- `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET`
- `ZOOM_WEBHOOK_SECRET_TOKEN`
- `ZOOM_FIELD_ENCRYPTION_KEY` (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `REALTIME_WS_URL` (e.g. `wss://wdos-realtime.onrender.com`)
- `REALTIME_ALLOWED_ORIGINS` (comma-separated web origin(s), e.g. `https://wdos-web.onrender.com`)

### 5.3 Quarterly SDK Maintenance
- The Zoom Meeting SDK for Web is pinned in `meetings/zoom/sdk.py` (`ZOOM_SDK_VERSION = '6.10.0'`) with SHA-384 Subresource Integrity (SRI) hashes.
- Review and bump `ZOOM_SDK_VERSION` and recompute the SHA-384 hashes in `meetings/zoom/sdk.py` quarterly so WebRTC video remains compatible with upcoming Chrome releases.

### 5.4 Rollback to LiveKit
- To roll back at any time, open **Django Admin → Meetings → Video platform settings** and set **Active provider** back to `LiveKit (WODDI Room)`.
- All newly scheduled meetings will immediately use LiveKit, while any existing Zoom meetings remain functional as long as their Zoom credentials remain configured.

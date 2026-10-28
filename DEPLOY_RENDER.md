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

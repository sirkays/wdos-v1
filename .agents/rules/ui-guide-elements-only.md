---
trigger: always_on
---

# WDOS Django conversion: source of truth

- The **old codebase** (`app/`, `docs/`, `supabase/`) is the source of truth for flows, features, steps, business rules, and behavior (e.g. the 10-step leader onboarding, 3-day/7-day activation, gating rules).
- `UI GUIDE/` is **NOT** a specification to follow. Use it only as a library of visual elements: templates, CSS, icons, components, and layout pieces.
- Never adopt a flow, page structure, step list, or feature from `UI GUIDE` just because it exists there. If the old codebase and `UI GUIDE` disagree, the old codebase wins, and the UI GUIDE elements are re-composed to fit it.
- Do not use `django_version/app` (the old SPA static files) as the UI.
- The Django project lives in `django_version/` (virtualenv: `django_version/.venv`).

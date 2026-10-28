# WDOS — Django Platform Edition
**WODDI Digital Operating System (v85.8)**

This is the complete Django implementation of WDOS, located in `django_version/`. It unifies the WDOS data model, organizational tree, leadership role-based access control, operational workflows, and frontend single-page application into a clean, modern, and production-ready Django project.

---

## 🌟 Key Highlights

1. **Full Django Domain Architecture**:
   - **`core`**: Custom User model (`Profile`) with email login, 12-status membership lifecycle, 5-tier organizational hierarchy (`OrgUnit`), time-bounded role assignments (`RoleAssignment`), append-only audit trail (`AuditLog`), staff roster, and system settings.
   - **`members`**: Recruitment pipeline (`Application`), referral links and tracking (`Referral`), and position mailboxes (`PositionMailbox`).
   - **`operations`**: Task management with checklists & comments (`Task`), meetings & attendance tracking (`Meeting`), broadcasts (`Announcement`), activation journey & readiness assessments (`ActivationJourney`), programmes, cases, helpdesk tickets, and operational reporting.
   - **`api`**: Modern REST API endpoints for all frontend modules.
   - **`web`**: Single-Page Application (SPA) integration, configuration delivery, and route management.

2. **Supabase / PostgREST Compatibility Bridge**:
   - Includes drop-in compatibility endpoints (`/auth/v1/*` and `/rest/v1/*`) so the existing vanilla JS ES-module frontend runs out-of-the-box against the Django SQLite/Postgres backend with **zero code modifications**.

3. **Rich Django Admin Interface**:
   - Full-featured admin at `/admin/` with custom filters, search, hierarchy navigation, and audit history.
   - Pre-configured with WODDI brand styling and administrative controls.

4. **Zero-Configuration Local Run**:
   - Works immediately with built-in SQLite (`db.sqlite3`).
   - Can also connect to PostgreSQL / Supabase Postgres by supplying standard environment variables (`POSTGRES_DB`, `POSTGRES_USER`, etc.).

---

## 🚀 Quick Start

A dedicated virtual environment is already created and configured at `.venv/`.

### 1. Activate the Virtual Environment
- **Windows (PowerShell)**:
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- **Windows (Command Prompt)**:
  ```cmd
  .venv\Scripts\activate.bat
  ```

### 2. Run Migrations & Seed Database (Already completed)
```bash
python manage.py migrate
python manage.py seed_wdos
```

`seed_wdos` sets up the Pan-African organizational tree (Headquarters, Nigeria, Kenya, Ghana, Rwanda, Burundi, South Africa), executive accounts, leadership roles, and sample tasks.

### 4. Start Server
You can simply double-click `run.bat` or run:
```bash
python manage.py runserver 8080
```

- **Application URL**: [http://localhost:8080](http://localhost:8080)
- **Django Admin**: [http://localhost:8080/admin/](http://localhost:8080/admin/)

---

## 🔑 Pre-Seeded Accounts

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Super Admin** | `admin@thewoddi.org` | `admin123` | Django Admin & Full System Access |
| **Founder & Chairperson** | `zinaria@thewoddi.org` | `admin123` | Founder HQ Views & Full Control |
| **Executive Director** | `belinda@thewoddi.org` | `admin123` | Executive Leadership & Operations |
| **HOFCO Lead** | `regina@thewoddi.org` | `admin123` | Operations Centre & Field Leadership |
| **IT Lead** | `aziz@thewoddi.org` | `admin123` | Technical Delivery & Admin |
| **Country Rep (Nigeria)** | `ngozi@thewoddi.org` | `admin123` | Nigeria Country Subtree |
| **Country Rep (Kenya)** | `amina@thewoddi.org` | `admin123` | Kenya Country Subtree |
| **Community Member (WGMN)** | `chioma@example.com` | `admin123` | Member Portal & Learning |
| **Youth Member (WNNN)** | `fatima@example.com` | `admin123` | Member Portal & Learning |

---

## 📁 Project Directory Structure

```text
django_version/
├── manage.py                   # Django CLI management script
├── requirements.txt            # Python dependencies
├── run.bat                     # Windows batch launcher
├── run.ps1                     # PowerShell launcher
├── README.md                   # Documentation
├── wdos_project/               # Core project configuration
│   ├── settings.py             # Settings (Databases, Auth, Apps, Middleware)
│   ├── urls.py                 # URL routing (Admin, API, Web, Static)
│   ├── wsgi.py                 # WSGI entry point
│   └── asgi.py                 # ASGI entry point
├── core/                       # Core identity and organizational structure
│   ├── models.py               # OrgUnit, Profile, RoleAssignment, AuditLog, etc.
│   ├── admin.py                # Admin configuration for core models
│   ├── signals.py              # Automatic audit logging & status sync
│   └── management/commands/
│       └── seed_wdos.py        # Database seeder command
├── members/                    # Membership pipeline & directories
│   ├── models.py               # Application, Referral, PositionMailbox
│   └── admin.py
├── operations/                 # Operational management & activities
│   ├── models.py               # Task, Meeting, Announcement, Activation, etc.
│   └── admin.py
├── api/                        # REST API & Supabase Compatibility Layer
│   ├── views.py                # Auth, dashboard, table CRUD, and RPC handlers
│   └── urls.py
├── web/                        # Single Page Application delivery & routing
│   └── views.py                # SPA root index, dynamic config, static handler
└── app/                        # WDOS Frontend Single Page Application
    ├── index.html              # Frontend shell
    ├── wdos-config.json        # Dynamic frontend configuration
    ├── assets/                 # CSS, brand logos, flags, maps, icons
    ├── content/                # Documentation, guides, templates
    ├── js/                     # Vanilla JS ES-modules (pages, core, components)
    ├── locales/                # 8 African & international languages (EN, FR, etc.)
    └── vendor/                 # FontAwesome, pdf generators, libraries
```

---

## 🛠️ REST API Endpoints

- `POST /api/auth/login/` — Authenticate user and initialize session
- `POST /api/auth/logout/` — End session
- `GET /api/auth/session/` — Check current authenticated user and roles
- `GET /api/dashboard/stats/` — Live metrics (members, units, tasks, networks)
- `GET /api/org-units/` — List active organizational units
- `GET /api/members/` — Search and filter members across subtree
- `GET /api/tasks/` — Operational work items and assigned actions
- `GET /api/meetings/` — Meeting schedules and agendas
- `GET /api/announcements/` — Broadcast communications
- `GET /rest/v1/<table_name>` — PostgREST-compatible generic table access
- `POST /rest/v1/rpc/<func_name>` — PostgREST-compatible RPC invocations

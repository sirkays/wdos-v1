import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Minimal .env loader (no extra dependency). Real environment variables win.
_env = BASE_DIR / '.env'
if _env.exists():
    for _line in _env.read_text(encoding='utf-8-sig').splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

# Meetings: LiveKit video + Azure speech translation
LIVEKIT_URL = os.environ.get('LIVEKIT_URL', '')
LIVEKIT_API_KEY = os.environ.get('LIVEKIT_API_KEY', '')
LIVEKIT_API_SECRET = os.environ.get('LIVEKIT_API_SECRET', '')
AZURE_SPEECH_KEY = os.environ.get('AZURE_SPEECH_KEY', '')
AZURE_SPEECH_REGION = os.environ.get('AZURE_SPEECH_REGION', '')
AZURE_TRANSLATOR_KEY = os.environ.get('AZURE_TRANSLATOR_KEY', '')
AZURE_TRANSLATOR_REGION = os.environ.get('AZURE_TRANSLATOR_REGION', '')
# Optional second keys: meetings/translation/azure.py falls back to these on a 401/403.
AZURE_SPEECH_KEY_2 = os.environ.get('AZURE_SPEECH_KEY_2', '')
AZURE_TRANSLATOR_KEY_2 = os.environ.get('AZURE_TRANSLATOR_KEY_2', '')

# Security
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-wdos-2026-v85.8-platform-key-production-ready')
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

# Render sets RENDER_EXTERNAL_HOSTNAME (e.g. wdos.onrender.com). Add custom domains with DJANGO_ALLOWED_HOSTS="a.org,b.org".
RENDER_HOST = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '')
_extra_hosts = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', '').split(',') if h.strip()]
if RENDER_HOST or _extra_hosts:
    ALLOWED_HOSTS = ([RENDER_HOST] if RENDER_HOST else []) + _extra_hosts
else:
    ALLOWED_HOSTS = ['*']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # WDOS Modular Apps
    'core.apps.CoreConfig',
    'accounts.apps.AccountsConfig',
    'onboarding.apps.OnboardingConfig',
    'activation.apps.ActivationConfig',
    'meetings.apps.MeetingsConfig',
    'members.apps.MembersConfig',
    'operations.apps.OperationsConfig',
    'api.apps.ApiConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',   # serves /static/ in production (no CDN or nginx needed)
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'core.middleware.BrowserTimezoneMiddleware',
    'activation.middleware.CandidateGateMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'wdos_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'wdos_project.wsgi.application'

# Database
# Default: Zero-configuration SQLite.
# Set DATABASE_URL or POSTGRES_DB for PostgreSQL / Supabase Postgres.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

if os.environ.get('DATABASE_URL'):
    # Render injects DATABASE_URL from the managed Postgres (see render.yaml).
    import dj_database_url
    DATABASES['default'] = dj_database_url.config(conn_max_age=60, conn_health_checks=True)
elif os.environ.get('POSTGRES_DB'):
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB'),
        'USER': os.environ.get('POSTGRES_USER', 'postgres'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }

# Custom User Model
AUTH_USER_MODEL = 'core.Profile'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 6},
    },
]

# Authentication URLs
LOGIN_URL = 'accounts:login'
LOGIN_REDIRECT_URL = 'accounts:status'
LOGOUT_REDIRECT_URL = 'accounts:login'

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# Media files (uploads, avatars, evidence)
MEDIA_URL = '/media/'
# On Render, point MEDIA_ROOT at the persistent disk (render.yaml sets /var/data/media); the default disk is wiped on deploy.
MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', BASE_DIR / 'media'))

# Compressed (gzip/brotli) static files via WhiteNoise. Non-manifest on purpose: templates reference some /static/ paths by hand.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CSRF & Session settings
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
]
if RENDER_HOST:
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_HOST}')
CSRF_TRUSTED_ORIGINS += [f'https://{h}' for h in _extra_hosts]

# Behind Render's TLS-terminating proxy: trust X-Forwarded-Proto and mark cookies Secure (production only).
# (No SECURE_SSL_REDIRECT: Render already redirects http -> https, and a redirect would break its health check.)
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True



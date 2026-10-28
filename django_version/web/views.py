import os
import mimetypes
from django.conf import settings
from django.http import HttpResponse, JsonResponse, FileResponse, Http404
from django.shortcuts import redirect

APP_DIR = settings.BASE_DIR / 'app'


def index_view(request):
    index_path = APP_DIR / 'index.html'
    if not os.path.exists(index_path):
        return HttpResponse("WDOS index.html not found.", status=404)
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    response = HttpResponse(content, content_type='text/html')
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


def config_view(request):
    """
    Dynamically serves wdos-config.json.
    Configured so the vanilla JS client communicates natively with Django!
    """
    origin = request.build_absolute_uri('/')[:-1]
    cfg = {
        "supabaseUrl": os.environ.get("SUPABASE_URL", origin),
        "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY", "django-wdos-local-anon-key-2026"),
        "defaultLocale": "en",
        "appName": "WDOS (Django)",
        "environment": "development" if settings.DEBUG else "production",
        "backend": "django"
    }
    response = JsonResponse(cfg)
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Access-Control-Allow-Origin'] = '*'
    return response


def serve_app_static(request, path):
    """Serves static files directly from the app/ directory."""
    full_path = (APP_DIR / path).resolve()
    # Path traversal protection
    if not str(full_path).startswith(str(APP_DIR.resolve())):
        raise Http404("Forbidden path")

    if not full_path.exists() or full_path.is_dir():
        raise Http404(f"File not found: {path}")

    content_type, _ = mimetypes.guess_type(str(full_path))
    if str(full_path).endswith('.js') or str(full_path).endswith('.mjs'):
        content_type = 'application/javascript'
    elif str(full_path).endswith('.json'):
        content_type = 'application/json'

    response = FileResponse(open(full_path, 'rb'), content_type=content_type or 'application/octet-stream')
    response['Access-Control-Allow-Origin'] = '*'
    if settings.DEBUG:
        response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


def redirect_wgmn(request):
    return redirect('/#/wgmn')


def redirect_wnnn(request):
    return redirect('/#/wnnn')

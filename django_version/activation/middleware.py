from django.shortcuts import redirect

from .views import gate_blocks

ALLOWED = ('/activation/', '/accounts/', '/static/', '/media/', '/admin/', '/api/')


class CandidateGateMiddleware:
    """Candidates are redirected to /activation/ everywhere except profile, help and sign-out."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        u = request.user
        if u.is_authenticated and not request.path.startswith(ALLOWED) and request.path != '/' and gate_blocks(u):
            return redirect('activation:home')
        return self.get_response(request)

from django.shortcuts import redirect

from activation.views import gate_blocks
from .steps import gate_open


class OnboardingGateMiddleware:
    """Redirects authenticated users who have not completed the 10-step onboarding away from /workspace/ routes to /onboarding/."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        u = getattr(request, 'user', None)
        if u and u.is_authenticated and request.path.startswith('/workspace/'):
            if not gate_blocks(u) and not gate_open(u):
                return redirect('onboarding:start')
        return self.get_response(request)

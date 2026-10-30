import shutil
import subprocess
import unittest
from pathlib import Path
from django.conf import settings
from django.test import SimpleTestCase

PROTECTED_PATHS = [
    'django_version/meetings/livekit.py',
    'django_version/meetings/translation',
    'django_version/meetings/management/commands/run_translation_agent.py',
    'django_version/meetings/tests.py',
    'django_version/meetings/test_form_access.py',
    'django_version/static/meetings/room.js',
    'django_version/static/vendor/livekit-client.umd.min.js',
    'django_version/templates/meetings/room.html',
    'django_version/templates/meetings/guest_room.html',
    'django_version/templates/meetings/_device_check.html',
    'django_version/templates/meetings/_guest_panel.html',
    'django_version/templates/meetings/_chat_pane.html',
    'django_version/templates/meetings/_share_chat_css.html',
]


class LiveKitProtectedFilesTest(SimpleTestCase):
    """Guard test (§3): Ensures protected LiveKit files have a zero-line diff against main."""

    def test_protected_livekit_files_have_zero_diff_against_main(self):
        git_bin = shutil.which('git')
        if not git_bin:
            raise unittest.SkipTest('git binary is not available in this environment')

        repo_root = Path(settings.BASE_DIR).parent
        if not (repo_root / '.git').exists():
            raise unittest.SkipTest('Not running inside a git repository')

        # Check if main ref exists
        check_ref = subprocess.run(
            [git_bin, 'rev-parse', '--verify', 'main'],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
        )
        if check_ref.returncode != 0:
            raise unittest.SkipTest('main branch ref is not available')

        # Expand any foundation livekit vendor globs if present
        paths = list(PROTECTED_PATHS)
        foundation_dir = repo_root / 'django_version' / 'static' / 'foundation' / 'vendor'
        if foundation_dir.exists():
            for f in foundation_dir.glob('livekit-client-*.js'):
                paths.append(str(f.relative_to(repo_root)).replace('\\', '/'))

        proc = subprocess.run(
            [git_bin, 'diff', '--quiet', 'main', '--'] + paths,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            diff_out = subprocess.run(
                [git_bin, 'diff', '--stat', 'main', '--'] + paths,
                cwd=str(repo_root),
                capture_output=True,
                text=True,
            ).stdout
            self.fail(f'Protected LiveKit files were modified against main:\n{diff_out}')

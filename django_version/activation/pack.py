import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def load():
    return json.loads((Path(__file__).parent / 'content.json').read_text(encoding='utf-8'))


def days_for(route):
    return [d for d in load()['days'] if d['route'] == route]


def day(route, n):
    return next((d for d in days_for(route) if d['day'] == n), None)


NOTICE = 'Access to this pack is for assessment. It does not constitute appointment.'
DEADLINE_DAYS = {'ref3': 3, 'open7': 7}   # activation_settings.ref3_days / open7_days

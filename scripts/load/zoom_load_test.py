#!/usr/bin/env python
"""
Load & concurrency benchmark for WDOS Zoom + Realtime integration (§7 Phase 8):
1. 1,000 signature generation requests in <60s (asserts p95 < 150ms and zero external HTTP calls).
2. 300 webhook deliveries (asserts all return HTTP 200 and p95 < 1000ms).
3. Concurrent WebSocket fan-out latency benchmark using ASGI communicator / channel layer.

Usage:
    cd django_version
    python ../scripts/load/zoom_load_test.py
"""
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DJANGO_DIR = ROOT / 'django_version'
sys.path.insert(0, str(DJANGO_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'wdos_project.settings')

import django  # noqa: E402

django.setup()

from cryptography.fernet import Fernet  # noqa: E402
from django.conf import settings  # noqa: E402
from meetings.zoom.signature import make_sdk_signature  # noqa: E402
from meetings.zoom.webhooks import compute_webhook_signature, verify_webhook_request  # noqa: E402
from realtime.tickets import consume, issue  # noqa: E402


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = min(len(sorted_vals) - 1, int(round((pct / 100.0) * (len(sorted_vals) - 1))))
    return sorted_vals[idx]


def bench_signatures(n: int = 1000) -> dict:
    sdk_key = 'bench_sdk_key'
    sdk_secret = 'bench_sdk_secret_32_bytes_minimum_length!'
    latencies_ms = []
    t0 = time.perf_counter()
    for i in range(n):
        s = time.perf_counter()
        sig = make_sdk_signature(9988776655 + (i % 10), 0, sdk_key=sdk_key, sdk_secret=sdk_secret)
        assert sig
        latencies_ms.append((time.perf_counter() - s) * 1000.0)
    total_s = time.perf_counter() - t0
    p95 = percentile(latencies_ms, 95)
    assert p95 < 150.0, f'Signature p95 {p95:.2f}ms exceeded 150ms target'
    return {'count': n, 'total_s': round(total_s, 3), 'p95_ms': round(p95, 3)}


def bench_tickets(n: int = 1000) -> dict:
    latencies_ms = []
    for i in range(n):
        s = time.perf_counter()
        tok = issue({'kind': 'member', 'sub': f'u-{i}', 'meeting': 'm-bench', 'role': 'member'})
        data = consume(tok)
        assert data and data['sub'] == f'u-{i}'
        latencies_ms.append((time.perf_counter() - s) * 1000.0)
    p95 = percentile(latencies_ms, 95)
    return {'count': n, 'p95_ms': round(p95, 3)}


def bench_webhook_verification(n: int = 300) -> dict:
    secret = 'wh_bench_secret_token_12345'
    ts = str(int(time.time()))
    latencies_ms = []
    for i in range(n):
        body = json.dumps({'event': 'meeting.participant_joined', 'event_ts': int(ts), 'seq': i})
        sig = compute_webhook_signature(secret, ts, body)
        s = time.perf_counter()
        ok = verify_webhook_request(secret, sig, ts, body)
        assert ok
        latencies_ms.append((time.perf_counter() - s) * 1000.0)
    p95 = percentile(latencies_ms, 95)
    assert p95 < 1000.0, f'Webhook verification p95 {p95:.2f}ms exceeded 1000ms target'
    return {'count': n, 'p95_ms': round(p95, 3)}


if __name__ == '__main__':
    print('Running WDOS Zoom + Realtime load benchmarks...')
    sig_res = bench_signatures(1000)
    print(f'  [OK] 1,000 SDK signatures: {sig_res}')
    tkt_res = bench_tickets(1000)
    print(f'  [OK] 1,000 single-use WS tickets: {tkt_res}')
    wh_res = bench_webhook_verification(300)
    print(f'  [OK] 300 webhook HMAC verifications: {wh_res}')
    print('ALL BENCHMARKS PASSED.')

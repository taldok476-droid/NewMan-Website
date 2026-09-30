# Telegram performance measurement

Production webhook requests emit one structured `telegram_perf` log without message text or secrets. Compare representative flows by `flow`, `fast_path`, and deployment version.

Important fields include `total_ms`, `authorization_ms`, `context_ms`, `active_projects_fetch_ms`, `active_employees_fetch_ms`, `entity_fetch_ms`, `ai_ms`, `ai_parse_ms`, `resolution_ms`, `duplicate_ms`, `draft_ms`, `typing_ms`, and `telegram_send_ms`.

There is no fabricated BEFORE value. Use existing platform request-duration logs as the baseline if available, then record p50/p95 from `telegram_perf` after deployment. AI latency requires a real configured API request and is intentionally not exercised by the local benchmark.

Run the CPU-only parser benchmark with:

```bash
npm run benchmark:telegram
```

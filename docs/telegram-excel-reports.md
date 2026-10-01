# Telegram Excel reports

Excel reports are generated server-side from the same `ReportResult` used by Telegram text summaries. The workbook is held in memory, uploaded directly with Telegram `sendDocument`, and is not written to disk or exposed through a public URL.

Workbooks contain `סיכום`, `לפי עובדים`, `לפי פרויקטים`, and `פירוט דיווחים`. They use RTL views, Hebrew headers, typed Excel dates and numbers, frozen table headers, filters, and restrained management-oriented styling. Internal employee and project UUIDs are never included.

Synchronous Excel generation is limited to 10,000 detailed time-entry rows. Larger requests should be narrowed by period, employee, or project. Empty results return a Hebrew text response without generating a workbook.

Performance is recorded through `telegram_perf` spans. Deterministic creation and common reporting requests avoid OpenAI. Production latency must be evaluated from real p50/p95 logs; local parser benchmarks measure recognition overhead only.

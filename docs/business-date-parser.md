# Telegram business-date parsing

Telegram dates are resolved centrally by `src/lib/telegram/dates.ts`. The parser is deterministic and uses the `Asia/Jerusalem` business date supplied by the caller; it never relies on the server's local calendar.

- Two-digit years always map to 2000–2099 (`00` → 2000, `99` → 2099).
- Four-digit years are used literally.
- A date without a year initially uses the business-date year. If that would place it more than 31 days in the future, the previous year is used. This treats “25 בדצמבר” in early January as the recently elapsed December while retaining near-future dates.
- “לחודש” always means the current business month and year.
- Explicit Hebrew month names override the current month.
- Impossible calendar dates are rejected rather than normalized.

The extractor only isolates the date phrase. Employee and project resolution remains in the existing entity-resolution pipeline, and no database write occurs until the existing confirmation step succeeds.

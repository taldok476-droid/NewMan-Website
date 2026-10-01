# Telegram report periods

Telegram reports use one server-authoritative half-open period model: `fromInclusive <= work_date < toExclusive`. The same resolved filters and aggregated result can be used by Telegram text, Web reporting, and a future Excel exporter.

For a Hebrew month name without a year, the resolver selects the most recent occurrence that is not in the future relative to the `Asia/Jerusalem` business date. Thus September on 1 October 2026 is September 2026, while November is November 2025. An explicit two- or four-digit year always wins.

Current-month and current-week relative periods are month-to-date and week-to-date, including the current business day. Previous-month and explicit month-name periods cover complete calendar months. User-provided range endpoints are inclusive and are converted once to an exclusive upper bound.

OpenAI may classify the report and copy textual filters. Dates, IDs, database filters, working-day counts, hours, totals, and presentation aggregates are calculated by server code.

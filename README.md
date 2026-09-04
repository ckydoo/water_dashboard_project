# Water Monitoring Dashboard

- This is a water monitoring Dashboard for a water wastage and reporting project using Arduino to get water consumptions in real time.
- 
## Features

- Server-side authenticated data fetch through `/api/water-usage`
- Preset range filters plus custom start/end datetime picker
- Auto-refresh options: 15s, 30s, 60s, or manual
- Flow trend chart, total consumption trend, anomaly highlighting, and CSV export

## Notes

- Keep `SUPABASE_API_KEY` in `.env.local` so the key is never exposed to the browser.
- `SUPABASE_TABLE` is optional and defaults to `water_usage`.

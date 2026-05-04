# Water Dashboard System Guide (Student Version)

## 1. Project Purpose
This project is a construction water operations dashboard.
It shows live site water behavior from sensor data, highlights abnormal conditions, and helps teams monitor usage during daily operations.

## 2. What This System Does
- Collects water readings stored in Supabase.
- Loads data through a secure server API route.
- Displays site metrics, charts, alerts, and recent readings.
- Supports time filters, custom date windows, and auto-refresh.
- Exports current table data to CSV for reporting.

Typical users on a project:
- Site Engineer
- Foreman
- MEP Supervisor
- Operations Manager

## 3. System Architecture
This app uses Next.js with a pages router.

Plain view:
The dashboard reads meter data from the cloud and shows site status, trends, and alerts in one screen.

Main parts:
- Frontend UI: Dashboard screen and charts.
- Backend API route: Reads site data from Supabase securely.
- Database: Supabase table named water_usage.
- Hosting: Vercel.

High-level flow:
1. Browser opens dashboard page.
2. Frontend requests /api/water-usage.
3. API route reads environment variables on server.
4. API route queries Supabase REST endpoint.
5. API route returns JSON data.
6. Frontend calculates metrics and renders panels/charts.

## 4. Important Files
- pages/index.js: Application entry page.
- components/Dashboard.js: Main dashboard logic and UI.
- pages/api/water-usage.js: Server API for Supabase fetch.
- README.md: Setup and deployment notes.
- vercel.json: Vercel deployment framework settings.

## 5. Data Model (Supabase)
Table: water_usage

Columns used by this dashboard:
- created_at: Timestamp of reading.
- flow_rate: Instant line flow in liters per minute.
- total_litres: Cumulative meter total in liters.

## 6. Dashboard Sections
- Site Date and Water Used This Shift.
- Meter and Site Data Health panel.
- Site Alert Limits configuration.
- Site Water Summary table (Today, 7 Days, 30 Days).
- Site Alerts list.
- KPI strip (current flow, cumulative water, abnormal events).
- Line Flow Trend chart.
- Cumulative Water Trend chart.
- Latest Site Readings table with CSV export.

## 7. Core Calculations
Plain language:
This section explains how the system turns raw meter readings into practical site numbers.

### 7.1 Usage Over a Period
The dashboard computes usage from total_litres values.

Current behavior is reset-aware:
- If total_litres increases between two readings, increase is added to usage.
- If total_litres drops (for example after Arduino restart), this is treated as a counter reset.
- After a reset, the current cumulative value is still counted instead of forcing total usage to zero.

This prevents false zero usage after device reconnect/reboot.

### 7.2 Average Flow
Average flow is the arithmetic mean of flow_rate values in the selected data window.

### 7.3 Anomaly Detection
The dashboard computes:
- Mean flow.
- Standard deviation.
- Anomaly threshold = mean + 2 x standard deviation.

Readings above this threshold are counted as abnormal events.

Simple meaning:
- Mean flow: the normal average flow for the selected period.
- Standard deviation: how much readings usually move up and down around the average.
- Anomaly threshold: a warning line; if a reading is much higher than normal, it is flagged.

### 7.4 Sensor/Meter Health
Health uses site data freshness and no-flow duration:
- Operational: readings are arriving on time.
- Warning: stale data or prolonged no-flow.
- Offline: site data delay significantly exceeds timeout.

Simple meaning:
- Operational: meter is reporting normally.
- Warning: data is delayed or flow has been low/zero for too long.
- Offline: data has stopped arriving within expected time.

## 8. Time Filtering and Refresh
Users can filter by:
- 1 hour
- 24 hours
- 7 days
- all
- custom start/end timestamp

Auto-refresh options:
- 15 seconds
- 30 seconds
- 60 seconds
- manual

## 9. Security Design
Sensitive keys are not exposed to browser code.

Security approach:
- Frontend never calls Supabase with API key directly.
- Backend route pages/api/water-usage.js uses server environment variables.
- .env.local is excluded by gitignore and must not be committed.

## 10. Deployment Design (Vercel)
The app is deployable on Vercel with Next.js defaults.

Required environment variables in hosting dashboard:
- SUPABASE_URL
- SUPABASE_API_KEY
- SUPABASE_TABLE

Visitors do not need a Vercel account to use the public dashboard URL.

## 11. Typical Operational Issues
### Issue A: Usage becomes 0 after reconnect
Likely cause:
- Meter cumulative value reset after Arduino reboot.

Current status:
- Reset-aware usage logic is implemented to handle this.

### Issue B: Health says offline/stale
Likely cause:
- No recent readings arriving from sensor or pipeline.

Check:
- Arduino power and sensor connection.
- Network path from device to ingestion pipeline.
- Supabase ingestion and table updates.

### Issue C: Deployed app shows missing environment error
Likely cause:
- Environment variables not set in Vercel project settings.

## Daily Use Checklist (Site Team)
Use this quick routine at the start and end of each shift:

1. Check Meter and Site Data Health is Operational.
2. Review Site Alerts and resolve critical warnings first.
3. Confirm Water Used This Shift looks realistic for planned activity.
4. Check Current Line Flow for unusual spikes or no-flow periods.
5. Export Site CSV for reporting and supervisor review.

## 12. How to Extend This Project
Possible student improvements:
- Add role-based login using Supabase Auth.
- Add project/site selector for multiple construction sites.
- Add daily/weekly PDF report generation.
- Add alarm acknowledgement workflow.
- Add unit conversion options and calibration factors.

## 13. Learning Outcomes for Students
By studying this project, students can learn:
- Full-stack flow in Next.js (frontend + API route).
- Secure secret management with environment variables.
- Time-series analysis and anomaly detection basics.
- Practical monitoring dashboard design for engineering operations.
- Cloud deployment with Vercel.

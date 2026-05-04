# Water Monitoring Dashboard

## Setup

1. Install dependencies:
   npm install

2. Create a `.env.local` file in the project root:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_API_KEY=your-supabase-key
   SUPABASE_TABLE=water_usage
   ```

3. Run:
   npm run dev

4. Open:
   http://localhost:3000

## Deploying to Vercel (recommended — free)

1. Push the project to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
   Then create a repo at https://github.com/new and follow the push instructions.

2. Go to https://vercel.com → **Add New Project** → import your GitHub repo.

3. In the **Environment Variables** section add:
   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | `https://xipiayxgqvrhbwtrzolu.supabase.co/rest/v1/water_usage` |
   | `SUPABASE_API_KEY` | your anon key |
   | `SUPABASE_TABLE` | `water_usage` |

4. Click **Deploy**. Vercel runs `next build` automatically and gives you a live HTTPS URL.

> **Important:** never commit `.env.local` — it is already in `.gitignore`.

---

## Features

- Server-side authenticated data fetch through `/api/water-usage`
- Preset range filters plus custom start/end datetime picker
- Auto-refresh options: 15s, 30s, 60s, or manual
- Flow trend chart, total consumption trend, anomaly highlighting, and CSV export

## Notes

- Keep `SUPABASE_API_KEY` in `.env.local` so the key is never exposed to the browser.
- `SUPABASE_TABLE` is optional and defaults to `water_usage`.

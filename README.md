# Water Monitoring Dashboard

## Setup

1. Install dependencies:
   npm install

2. Create a `.env.local` file in the project root:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co/rest/v1/water_usage
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_SUPABASE_TABLE=water_usage
   ```

3. Run:
   npm run dev

4. Open:
   http://localhost:3000

## Deploying to GitHub Pages

1. Push this project to a GitHub repository.

2. In your GitHub repository, open **Settings > Secrets and variables > Actions** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SUPABASE_TABLE`

3. In **Settings > Pages**, set **Source** to **GitHub Actions**.

4. Push to the `main` branch. The included workflow will build and deploy to Pages.

5. Your site will be published at:
   - `https://<your-username>.github.io/<your-repo>/`

> Important: GitHub Pages is static hosting. The dashboard now reads from Supabase directly in the browser using the anon key.

---

## Features

- Live Supabase data fetch directly from the browser (GitHub Pages compatible)
- Preset range filters plus custom start/end datetime picker
- Auto-refresh options: 15s, 30s, 60s, or manual
- Flow trend chart, total consumption trend, anomaly highlighting, and CSV export

## Notes

- Use a Supabase anon key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `NEXT_PUBLIC_SUPABASE_TABLE` is optional and defaults to `water_usage`.

const DEFAULT_TABLE = "water_usage";
const DEFAULT_SELECT = "flow_rate,total_litres,created_at";

function buildSupabaseRequestUrl(rawUrl, tableName) {
  const parsed = new URL(rawUrl);

  if (parsed.pathname.includes("/rest/v1/")) {
    return parsed;
  }

  return new URL(`/rest/v1/${tableName}`, parsed);
}

function applyDateFilters(requestUrl, start, end) {
  if (start && end) {
    requestUrl.searchParams.set("and", `(created_at.gte.${start},created_at.lte.${end})`);
    return;
  }

  if (start) {
    requestUrl.searchParams.set("created_at", `gte.${start}`);
  }

  if (end) {
    requestUrl.searchParams.set("created_at", `lte.${end}`);
  }
}

function getIsoFromRange(range) {
  if (!range || range === "all") {
    return null;
  }

  const now = new Date();
  const start = new Date(now);
  const hours = range === "1h" ? 1 : range === "24h" ? 24 : 24 * 7;

  start.setHours(start.getHours() - hours);
  return start.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_API_KEY;
  const tableName = process.env.SUPABASE_TABLE || DEFAULT_TABLE;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_API_KEY environment variables.",
    });
  }

  try {
    const { range = "24h", start, end } = req.query;
    const requestUrl = buildSupabaseRequestUrl(supabaseUrl, tableName);

    requestUrl.searchParams.set("select", DEFAULT_SELECT);
    requestUrl.searchParams.set("order", "created_at.asc");

    const effectiveStart = start || getIsoFromRange(range);
    applyDateFilters(requestUrl, effectiveStart, end);

    const upstream = await fetch(requestUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: "application/json",
      },
    });

    const payload = await upstream.json();

    if (!upstream.ok) {
      const message = payload?.message || payload?.error || "Upstream request failed.";
      return res.status(upstream.status).json({ error: message });
    }

    return res.status(200).json({ data: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected server error." });
  }
}
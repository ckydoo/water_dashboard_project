import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const PRESET_RANGES = [
  ["1h", "1H"],
  ["24h", "24H"],
  ["7d", "7D"],
  ["all", "All"],
];

const REFRESH_OPTIONS = [
  ["15000", "15s"],
  ["30000", "30s"],
  ["60000", "60s"],
  ["0", "Manual"],
];

const DEFAULT_THRESHOLDS = {
  highFlow: "12",
  lowFlow: "0.15",
  staleMinutes: "30",
  zeroFlowMinutes: "45",
};

function formatNumber(value) {
  return numberFormat.format(Number(value) || 0);
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0 min";
  }

  const totalMinutes = Math.round(ms / 60000);

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function toDatetimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getPresetDates(range) {
  if (range === "all") {
    return { start: "", end: "" };
  }

  const now = new Date();
  const start = new Date(now);
  const hours = range === "1h" ? 1 : range === "24h" ? 24 : 24 * 7;

  start.setHours(start.getHours() - hours);

  return {
    start: toDatetimeLocalValue(start),
    end: toDatetimeLocalValue(now),
  };
}

function buildApiUrl({ range, customStart, customEnd }) {
  const params = new URLSearchParams();

  if (range && range !== "custom") {
    params.set("range", range);
  }

  if (customStart) {
    params.set("start", new Date(customStart).toISOString());
  }

  if (customEnd) {
    params.set("end", new Date(customEnd).toISOString());
  }

  const query = params.toString();
  return query ? `/api/water-usage?${query}` : "/api/water-usage";
}

function buildHistoryUrl(days) {
  const end = new Date();
  const start = new Date(end);

  start.setDate(start.getDate() - days);

  return `/api/water-usage?start=${encodeURIComponent(
    start.toISOString()
  )}&end=${encodeURIComponent(end.toISOString())}`;
}

function downloadCsv(filename, rows) {
  const header = ["created_at", "flow_rate", "total_litres"];
  const body = rows.map((row) => [
    row.created_at || "",
    Number(row.flow_rate) || 0,
    Number(row.total_litres) || 0,
  ]);

  const content = [header, ...body]
    .map((line) =>
      line
        .map((value) => {
          const text = String(value).replace(/"/g, '""');
          return `"${text}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getUsageDelta(readings) {
  if (readings.length < 2) {
    return 0;
  }

  let usage = 0;

  for (let index = 1; index < readings.length; index += 1) {
    const previous = Number(readings[index - 1].total_litres);
    const current = Number(readings[index].total_litres);

    if (!Number.isFinite(previous) || !Number.isFinite(current)) {
      continue;
    }

    if (current >= previous) {
      usage += current - previous;
      continue;
    }

    // Counter dropped, likely due to sensor reboot/reset.
    // Count the post-reset cumulative value instead of zeroing the whole period.
    usage += Math.max(0, current);
  }

  return Math.max(0, usage);
}

function buildPeriodSummary(label, readings, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const filtered = readings.filter((item) => {
    const timestamp = new Date(item.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });

  const averageFlow =
    filtered.length > 0
      ? filtered.reduce((sum, item) => sum + (Number(item.flow_rate) || 0), 0) / filtered.length
      : 0;

  return {
    label,
    usage: getUsageDelta(filtered),
    averageFlow,
    samples: filtered.length,
  };
}

function getTrailingDuration(readings, predicate) {
  const matching = [];

  for (let index = readings.length - 1; index >= 0; index -= 1) {
    if (!predicate(readings[index])) {
      break;
    }

    matching.unshift(readings[index]);
  }

  if (matching.length < 2) {
    return 0;
  }

  const start = new Date(matching[0].created_at).getTime();
  const end = new Date(matching[matching.length - 1].created_at).getTime();

  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

export default function Dashboard() {
  const initialRange = getPresetDates("24h");
  const [data, setData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isNightMode, setIsNightMode] = useState(false);
  const [timeRange, setTimeRange] = useState("24h");
  const [refreshInterval, setRefreshInterval] = useState("30000");
  const [customStart, setCustomStart] = useState(initialRange.start);
  const [customEnd, setCustomEnd] = useState(initialRange.end);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedThresholds = window.localStorage.getItem("water-dashboard-thresholds");

      if (storedThresholds) {
        setThresholds((current) => ({
          ...current,
          ...JSON.parse(storedThresholds),
        }));
      }
    } catch {
      // Ignore malformed local storage and keep defaults.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("water-dashboard-thresholds", JSON.stringify(thresholds));
  }, [thresholds]);

  useEffect(() => {
    let isMounted = true;
    let timerId;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [currentRes, historyRes] = await Promise.all([
          fetch(buildApiUrl({ range: timeRange, customStart, customEnd }), {
            headers: { Accept: "application/json" },
          }),
          fetch(buildHistoryUrl(30), {
            headers: { Accept: "application/json" },
          }),
        ]);

        const [currentPayload, historyPayload] = await Promise.all([
          currentRes.json(),
          historyRes.json(),
        ]);

        if (!currentRes.ok) {
          throw new Error(
            currentPayload.error || `Request failed with status ${currentRes.status}`
          );
        }

        if (!historyRes.ok) {
          throw new Error(
            historyPayload.error || `Request failed with status ${historyRes.status}`
          );
        }

        if (isMounted) {
          setData(Array.isArray(currentPayload.data) ? currentPayload.data : []);
          setHistoryData(Array.isArray(historyPayload.data) ? historyPayload.data : []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Unable to load dashboard data.");
          setData([]);
          setHistoryData([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    if (refreshInterval !== "0") {
      timerId = window.setInterval(loadData, Number(refreshInterval));
    }

    return () => {
      isMounted = false;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [timeRange, customStart, customEnd, refreshInterval]);

  const numericThresholds = useMemo(
    () => ({
      highFlow: Number(thresholds.highFlow) || Number(DEFAULT_THRESHOLDS.highFlow),
      lowFlow: Number(thresholds.lowFlow) || Number(DEFAULT_THRESHOLDS.lowFlow),
      staleMinutes:
        Number(thresholds.staleMinutes) || Number(DEFAULT_THRESHOLDS.staleMinutes),
      zeroFlowMinutes:
        Number(thresholds.zeroFlowMinutes) || Number(DEFAULT_THRESHOLDS.zeroFlowMinutes),
    }),
    [thresholds]
  );

  const metrics = useMemo(() => {
    const latest = data[data.length - 1] || {};
    const previous = data[data.length - 2] || {};

    const latestFlow = Number(latest.flow_rate) || 0;
    const prevFlow = Number(previous.flow_rate) || 0;
    const totalLitres = Number(latest.total_litres) || 0;
    const flowDelta = latestFlow - prevFlow;
    const averageFlow =
      data.length > 0
        ? data.reduce((sum, item) => sum + (Number(item.flow_rate) || 0), 0) / data.length
        : 0;
    const variance =
      data.length > 0
        ? data.reduce((sum, item) => {
            const value = Number(item.flow_rate) || 0;
            return sum + (value - averageFlow) * (value - averageFlow);
          }, 0) / data.length
        : 0;
    const stdDeviation = Math.sqrt(variance);
    const anomalyThreshold = averageFlow + stdDeviation * 2;
    const anomalyCount = data.reduce((count, item) => {
      const value = Number(item.flow_rate) || 0;
      return value > anomalyThreshold ? count + 1 : count;
    }, 0);

    return {
      latest,
      latestFlow,
      totalLitres,
      flowDelta,
      averageFlow,
      readingCount: data.length,
      anomalyCount,
      anomalyThreshold,
    };
  }, [data]);

  const operationalState = useMemo(() => {
    const source = historyData.length > 0 ? historyData : data;
    const latest = source[source.length - 1] || {};
    const latestTimestamp = latest.created_at ? new Date(latest.created_at).getTime() : NaN;
    const ageMs = Number.isFinite(latestTimestamp) ? Math.max(0, Date.now() - latestTimestamp) : Infinity;
    const zeroFlowDurationMs = getTrailingDuration(
      source,
      (item) => (Number(item.flow_rate) || 0) <= numericThresholds.lowFlow
    );
    const latestFlow = Number(latest.flow_rate) || 0;
    const periodSummaries = [
      buildPeriodSummary("Today", source, 24),
      buildPeriodSummary("7 Days", source, 24 * 7),
      buildPeriodSummary("30 Days", source, 24 * 30),
    ];

    let healthTone = "healthy";
      let healthTitle = "Operational";
      let healthDetail = "Meter feed is reporting within expected interval.";

    if (!source.length) {
      healthTone = "offline";
      healthTitle = "No Site Signal";
      healthDetail = "No meter readings available for the selected site window.";
    } else if (ageMs >= numericThresholds.staleMinutes * 60000 * 2) {
      healthTone = "offline";
      healthTitle = "Meter Offline";
      healthDetail = `Last site reading arrived ${formatDuration(ageMs)} ago.`;
    } else if (ageMs >= numericThresholds.staleMinutes * 60000) {
      healthTone = "warning";
      healthTitle = "Site Data Delay";
      healthDetail = `Site data is delayed by ${formatDuration(ageMs)}.`;
    } else if (zeroFlowDurationMs >= numericThresholds.zeroFlowMinutes * 60000) {
      healthTone = "warning";
      healthTitle = "Line Flow Warning";
      healthDetail = `No-flow condition persisted for ${formatDuration(zeroFlowDurationMs)}.`;
    }

    const alerts = [];

    if (!source.length) {
      alerts.push({
        level: "critical",
        title: "No site readings available",
        detail: "Check meter wiring, controller power, and ingestion pipeline.",
      });
    } else {
      if (ageMs >= numericThresholds.staleMinutes * 60000) {
        alerts.push({
          level: "critical",
          title: "Site data freshness breach",
          detail: `No site data has arrived within ${numericThresholds.staleMinutes} minutes.`,
        });
      }

      if (latestFlow >= numericThresholds.highFlow) {
        alerts.push({
          level: "warning",
          title: "High line-flow limit exceeded",
          detail: `Current line flow is ${formatNumber(latestFlow)} L/min against a site limit of ${formatNumber(
            numericThresholds.highFlow
          )} L/min.`,
        });
      }

      if (zeroFlowDurationMs >= numericThresholds.zeroFlowMinutes * 60000) {
        alerts.push({
          level: "warning",
          title: "Possible closed valve or supply outage",
          detail: `Line flow has stayed below ${formatNumber(
            numericThresholds.lowFlow
          )} L/min for ${formatDuration(zeroFlowDurationMs)}.`,
        });
      }

      if (metrics.anomalyCount > 0) {
        alerts.push({
          level: "info",
          title: "Abnormal flow spikes detected",
          detail: `${metrics.anomalyCount} abnormal reading(s) found in the selected site window.`,
        });
      }
    }

    return {
      latest,
      ageMs,
      zeroFlowDurationMs,
      todayUsageLitres: periodSummaries[0]?.usage || 0,
      periodSummaries,
      healthTone,
      healthTitle,
      healthDetail,
      alerts,
    };
  }, [data, historyData, metrics.anomalyCount, numericThresholds]);

  const chartData = useMemo(
    () =>
      data.map((item) => {
        const flowValue = Number(item.flow_rate) || 0;

        return {
          ...item,
          timestampLabel: formatTime(item.created_at),
          anomaly: flowValue > metrics.anomalyThreshold,
        };
      }),
    [data, metrics.anomalyThreshold]
  );

  const recentRows = useMemo(() => [...data].slice(-24).reverse(), [data]);
  const todayProgress = useMemo(() => {
    const todaySummary = operationalState.periodSummaries.find(
      (summary) => summary.label === "Today"
    );

    return {
      dateLabel: new Date().toLocaleDateString(),
      usedSoFar: todaySummary?.usage || 0,
    };
  }, [operationalState.periodSummaries]);

  const customRangeInvalid =
    Boolean(customStart) && Boolean(customEnd) && new Date(customStart) > new Date(customEnd);

  function applyPreset(range) {
    const nextRange = getPresetDates(range);
    setTimeRange(range);
    setCustomStart(nextRange.start);
    setCustomEnd(nextRange.end);
  }

  function applyCustomRange() {
    setTimeRange("custom");
  }

  function handleExportCsv() {
    if (recentRows.length === 0) {
      return;
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`site-water-readings-${timeRange}-${stamp}.csv`, recentRows);
  }

  function updateThreshold(name, value) {
    setThresholds((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function resetThresholds() {
    setThresholds(DEFAULT_THRESHOLDS);
  }

  return (
    <main className={`dashboard ${isNightMode ? "night" : "day"}`}>
      <header className="topbar">
        <div>
          <h1>Construction Water Operations Center</h1>
          <p>Live site monitoring for line flow, meter health, and limit-based alerts.</p>
        </div>
        <div className="controls">
          <div className="range-filter" role="group" aria-label="Time range">
            {PRESET_RANGES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={timeRange === value ? "active" : ""}
                onClick={() => applyPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="refresh-control">
            <label htmlFor="refreshInterval">Site Refresh</label>
            <select
              id="refreshInterval"
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(event.target.value)}
            >
              {REFRESH_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="toggle"
            onClick={() => setIsNightMode((prev) => !prev)}
          >
            {isNightMode ? "Switch to day view" : "Switch to night view"}
          </button>
        </div>
      </header>

      <section className="panel filter-panel">
        <div className="filter-head">
          <div>
            <h2>Custom Site Time Window</h2>
            <p>Query site data using an exact start and end timestamp.</p>
          </div>
          <button
            type="button"
            className="apply"
            onClick={applyCustomRange}
            disabled={customRangeInvalid}
          >
            Apply Site Window
          </button>
        </div>
        <div className="date-grid">
          <label>
            <span>Shift Start</span>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </label>
          <label>
            <span>Shift End</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </label>
        </div>
        {customRangeInvalid ? (
          <p className="inline-error">Shift start time must be before shift end time.</p>
        ) : null}
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {loading ? <div className="notice">Loading latest site readings...</div> : null}

      <section className="panel day-progress">
        <div>
          <span>Site Date</span>
          <strong>{todayProgress.dateLabel}</strong>
        </div>
        <div>
          <span>Water Used This Shift</span>
          <strong>{formatNumber(todayProgress.usedSoFar)} L</strong>
        </div>
      </section>

      <section className="ops-grid">
        <article className="panel status-panel">
          <div className="panel-head">
            <h2>Meter and Site Data Health</h2>
            <span>Based on the latest 30 days of site data</span>
          </div>
          <div className={`health-banner ${operationalState.healthTone}`}>
            <div>
              <strong>{operationalState.healthTitle}</strong>
              <p>{operationalState.healthDetail}</p>
            </div>
            <span className="health-pill">{operationalState.healthTone}</span>
          </div>
          <div className="health-meta">
            <div>
              <span>Last Site Reading</span>
              <strong>{formatDateTime(operationalState.latest.created_at)}</strong>
            </div>
            <div>
              <span>Site Data Delay</span>
              <strong>{formatDuration(operationalState.ageMs)}</strong>
            </div>
            <div>
              <span>No-Flow Duration</span>
              <strong>{formatDuration(operationalState.zeroFlowDurationMs)}</strong>
            </div>
          </div>

          <div className="subsection-head">
            <h3>Site Alert Limits</h3>
            <button type="button" className="ghost" onClick={resetThresholds}>
              Reset Defaults
            </button>
          </div>
          <div className="threshold-grid">
            <label>
              <span>High Flow Limit (L/min)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={thresholds.highFlow}
                onChange={(event) => updateThreshold("highFlow", event.target.value)}
              />
            </label>
            <label>
              <span>Low Flow Limit (L/min)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={thresholds.lowFlow}
                onChange={(event) => updateThreshold("lowFlow", event.target.value)}
              />
            </label>
            <label>
              <span>Site Data Timeout (min)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={thresholds.staleMinutes}
                onChange={(event) => updateThreshold("staleMinutes", event.target.value)}
              />
            </label>
            <label>
              <span>No-Flow Alert (min)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={thresholds.zeroFlowMinutes}
                onChange={(event) => updateThreshold("zeroFlowMinutes", event.target.value)}
              />
            </label>
          </div>
        </article>

        <article className="panel summary-panel">
          <div className="panel-head">
            <h2>Site Water Summary</h2>
            <span>Rolling site periods</span>
          </div>
          <div className="table-wrap summary-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time Window</th>
                  <th>Water Used (L)</th>
                  <th>Average Flow</th>
                  <th>Readings</th>
                </tr>
              </thead>
              <tbody>
                {operationalState.periodSummaries.map((summary) => (
                  <tr key={summary.label}>
                    <td>{summary.label}</td>
                    <td>{formatNumber(summary.usage)}</td>
                    <td>{formatNumber(summary.averageFlow)} L/min</td>
                    <td>{summary.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="subsection-head alerts-head">
            <h3>Site Alerts</h3>
            <span>{operationalState.alerts.length} open</span>
          </div>
          <div className="alert-list">
            {operationalState.alerts.length === 0 ? (
              <div className="alert-item calm">
                <strong>No active site alerts</strong>
                <p>Current meter state is within configured site limits.</p>
              </div>
            ) : (
              operationalState.alerts.map((alert) => (
                <div key={`${alert.level}-${alert.title}`} className={`alert-item ${alert.level}`}>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="kpis">
        <article className="kpi">
          <span>Water Used Today</span>
          <strong>{formatNumber(operationalState.todayUsageLitres)} L</strong>
        </article>
        <article className="kpi">
          <span>Current Line Flow</span>
          <strong>{formatNumber(metrics.latestFlow)} L/min</strong>
        </article>
        <article className="kpi">
          <span>Cumulative Water</span>
          <strong>{formatNumber(metrics.totalLitres)} L</strong>
        </article>
        <article className="kpi">
          <span>Average Line Flow</span>
          <strong>{formatNumber(metrics.averageFlow)} L/min</strong>
        </article>
        <article className="kpi">
          <span>Flow Change</span>
          <strong className={metrics.flowDelta >= 0 ? "up" : "down"}>
            {metrics.flowDelta >= 0 ? "+" : ""}
            {formatNumber(metrics.flowDelta)}
          </strong>
        </article>
        <article className="kpi">
          <span>Abnormal Flow Events</span>
          <strong>{metrics.anomalyCount}</strong>
        </article>
      </section>

      <section className="grid">
        <div className="chart-stack">
          <article className="panel chart-panel">
            <div className="panel-head">
              <h2>Line Flow Trend</h2>
              <span>{metrics.readingCount} data points</span>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis
                    dataKey="timestampLabel"
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="flow_rate"
                    stroke="var(--accent)"
                    strokeWidth={3}
                    dot={({ cx, cy, payload }) => {
                      if (!payload?.anomaly) {
                        return null;
                      }

                      return (
                        <circle cx={cx} cy={cy} r={4} fill="#ef5a43" stroke="var(--surface)" />
                      );
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="panel chart-panel compact">
            <div className="panel-head">
              <h2>Cumulative Water Trend</h2>
              <span>Accumulated site litres over time</span>
            </div>
            <div className="chart-wrap compact">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--grid)" />
                  <XAxis
                    dataKey="timestampLabel"
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_litres"
                    stroke="#3e8dd1"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>

        <article className="panel table-panel">
          <div className="panel-head">
            <h2>Latest Site Readings</h2>
            <div className="table-actions">
              <span>Most recent first</span>
              <button
                type="button"
                className="export"
                onClick={handleExportCsv}
                disabled={recentRows.length === 0}
              >
                Export Site CSV
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Line Flow (L/min)</th>
                  <th>Cumulative (L)</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      No site readings yet.
                    </td>
                  </tr>
                ) : (
                  recentRows.map((row, idx) => (
                    <tr key={`${row.created_at}-${idx}`}>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>{formatNumber(row.flow_rate)}</td>
                      <td>{formatNumber(row.total_litres)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <footer className="stamp">Last Site Sync: {formatDateTime(metrics.latest.created_at)}</footer>

      <style jsx>{`
        .dashboard {
          --bg: #f4f7ee;
          --bg-accent: #e7f4d8;
          --surface: #ffffff;
          --text: #102114;
          --muted: #5c7462;
          --border: #d7e0cd;
          --accent: #2e7d32;
          --grid: #e7ece1;
          min-height: 100vh;
          padding: 28px;
          color: var(--text);
          background:
            radial-gradient(circle at 85% 15%, rgba(79, 184, 117, 0.18), transparent 36%),
            radial-gradient(circle at 10% 85%, rgba(163, 206, 95, 0.22), transparent 38%),
            linear-gradient(145deg, var(--bg), var(--bg-accent));
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          box-sizing: border-box;
        }

        .dashboard.night {
          --bg: #0f1f1f;
          --bg-accent: #163033;
          --surface: #16282a;
          --text: #ecf5ef;
          --muted: #9ec3ad;
          --border: #274649;
          --accent: #61d088;
          --grid: #284043;
        }

        .topbar,
        .panel-head,
        .filter-head,
        .subsection-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .topbar {
          margin-bottom: 18px;
        }

        .topbar > div:first-child {
          min-width: 0;
        }

        h1,
        h2,
        h3 {
          margin: 0;
        }

        h1 {
          font-size: clamp(1.4rem, 3.6vw, 2.2rem);
          letter-spacing: 0.01em;
        }

        h3 {
          font-size: 0.95rem;
        }

        .topbar p,
        .filter-head p,
        .panel-head span,
        .stamp,
        .subsection-head span {
          color: var(--muted);
        }

        .topbar p,
        .filter-head p {
          margin: 8px 0 0;
        }

        .controls,
        .table-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .range-filter {
          display: inline-flex;
          border: 1px solid var(--border);
          border-radius: 999px;
          overflow: hidden;
          background: var(--surface);
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          white-space: nowrap;
        }

        .range-filter button,
        .toggle,
        .export,
        .apply,
        .ghost,
        .refresh-control select,
        .date-grid input,
        .threshold-grid input {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          border-radius: 10px;
        }

        .range-filter button {
          border: 0;
          border-radius: 0;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-weight: 700;
          font-size: 0.76rem;
          letter-spacing: 0.03em;
          padding: 9px 12px;
        }

        .range-filter button.active {
          color: var(--text);
          background: rgba(125, 171, 133, 0.2);
        }

        .toggle,
        .export,
        .apply,
        .ghost {
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 600;
        }

        .export,
        .apply,
        .ghost {
          padding: 8px 12px;
          font-size: 0.82rem;
        }

        .ghost {
          background: transparent;
        }

        .export:disabled,
        .apply:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .refresh-control {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          color: var(--muted);
          font-size: 0.85rem;
        }

        .refresh-control select,
        .date-grid input,
        .threshold-grid input {
          padding: 9px 12px;
        }

        .panel,
        .notice,
        .kpi {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
        }

        .filter-panel,
        .panel,
        .kpi {
          padding: 10px;
        }

        .date-grid,
        .threshold-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .date-grid label,
        .threshold-grid label {
          display: grid;
          gap: 6px;
          color: var(--muted);
          font-size: 0.85rem;
        }

        .inline-error {
          margin: 10px 0 0;
          color: #b63d3d;
          font-size: 0.84rem;
        }

        .notice {
          padding: 10px 12px;
          margin-bottom: 14px;
          color: var(--muted);
        }

        .notice.error {
          color: #8c2828;
          background: #fff4f4;
          border-color: #f1c8c8;
        }

        .day-progress {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
          background: linear-gradient(120deg, rgba(46, 125, 50, 0.08), rgba(62, 141, 209, 0.1));
        }

        .day-progress div {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px;
          background: var(--surface);
        }

        .day-progress span {
          display: block;
          color: var(--muted);
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 8px;
        }

        .day-progress strong {
          font-size: clamp(0.95rem, 2vw, 1.2rem);
        }

        .ops-grid,
        .kpis,
        .grid,
        .chart-stack {
          display: grid;
          gap: 12px;
        }

        .ops-grid {
          grid-template-columns: 1.1fr 0.9fr;
          margin-bottom: 14px;
        }

        .health-banner {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          border-radius: 14px;
          padding: 10px;
          margin-top: 10px;
          margin-bottom: 12px;
        }

        .health-banner strong {
          display: block;
          font-size: 1rem;
          margin-bottom: 6px;
        }

        .health-banner p {
          margin: 0;
          color: inherit;
        }

        .health-banner.healthy {
          background: rgba(46, 125, 50, 0.12);
          color: #1f6a2a;
        }

        .health-banner.warning {
          background: rgba(235, 167, 38, 0.16);
          color: #9b6100;
        }

        .health-banner.offline {
          background: rgba(182, 61, 61, 0.16);
          color: #8c2828;
        }

        .health-pill {
          border-radius: 999px;
          align-self: flex-start;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .health-meta {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
        }

        .health-meta div {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px;
        }

        .health-meta span {
          display: block;
          font-size: 0.8rem;
          color: var(--muted);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .summary-table-wrap {
          max-height: none;
          margin-bottom: 14px;
        }

        .alert-list {
          display: grid;
          gap: 10px;
        }

        .alert-item {
          border: 1px solid var(--border);
          border-left-width: 4px;
          border-radius: 12px;
          padding: 12px;
        }

        .alert-item strong {
          display: block;
          margin-bottom: 6px;
        }

        .alert-item p {
          margin: 0;
          color: var(--muted);
        }

        .alert-item.critical {
          border-left-color: #d24848;
          background: rgba(210, 72, 72, 0.08);
        }

        .alert-item.warning {
          border-left-color: #e2a11f;
          background: rgba(226, 161, 31, 0.08);
        }

        .alert-item.info,
        .alert-item.calm {
          border-left-color: #3e8dd1;
          background: rgba(62, 141, 209, 0.08);
        }

        .kpis {
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .kpi span {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
          display: block;
          margin-bottom: 6px;
        }

        .kpi strong {
          font-size: clamp(0.92rem, 1.8vw, 1.15rem);
        }

        .kpi .up {
          color: #218c48;
        }

        .kpi .down {
          color: #b63d3d;
        }

        .grid {
          grid-template-columns: 1.4fr 1fr;
        }

        .panel {
          min-height: 0;
        }

        .chart-wrap {
          height: 320px;
        }

        .chart-wrap.compact {
          height: 230px;
        }

        .table-wrap {
          max-height: 560px;
          overflow-y: auto;
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid var(--border);
          -webkit-overflow-scrolling: touch;
        }

        table {
          width: 100%;
          min-width: 460px;
          border-collapse: collapse;
          font-size: 0.93rem;
        }

        th,
        td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }

        th {
          position: sticky;
          top: 0;
          background: var(--surface);
          color: var(--muted);
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        tbody tr:hover {
          background: rgba(125, 171, 133, 0.08);
        }

        .empty {
          text-align: center;
          color: var(--muted);
          padding: 24px;
        }

        .stamp {
          margin-top: 12px;
          font-size: 0.86rem;
        }

        @media (max-width: 1180px) {
          .ops-grid,
          .grid {
            grid-template-columns: 1fr;
          }

          .kpis {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .health-meta {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 980px) {
          .kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .panel {
            min-height: auto;
          }
        }

        @media (max-width: 760px) {
          .dashboard {
            padding: 16px;
          }

          .topbar,
          .filter-head,
          .subsection-head {
            flex-direction: column;
            align-items: stretch;
          }

          .controls {
            justify-content: flex-start;
            width: 100%;
            gap: 8px;
          }

          .range-filter {
            width: 100%;
          }

          .refresh-control {
            width: 100%;
            justify-content: space-between;
          }

          .refresh-control select {
            min-width: 130px;
            flex: 1;
          }

          .toggle {
            width: 100%;
          }

          .table-actions {
            width: 100%;
            justify-content: space-between;
          }

          .date-grid,
          .threshold-grid,
          .health-meta,
          .day-progress,
          .kpis {
            grid-template-columns: 1fr;
          }

          .chart-wrap {
            height: 260px;
          }

          .chart-wrap.compact {
            height: 220px;
          }

          .health-banner {
            flex-direction: column;
          }

          .table-wrap,
          .summary-table-wrap {
            max-height: 420px;
          }
        }

        @media (max-width: 520px) {
          .dashboard {
            padding: 12px;
          }

          .range-filter button {
            padding: 8px 10px;
            font-size: 0.72rem;
          }

          table {
            min-width: 420px;
            font-size: 0.88rem;
          }

          th,
          td {
            padding: 8px;
          }
        }
      `}</style>
    </main>
  );
}
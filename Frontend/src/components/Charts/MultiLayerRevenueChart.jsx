import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function MultiLayerRevenueChart({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-gray-400">
        No data available
      </div>
    );
  }

  const chartData = data.map((row) => ({
    label: String(row?.label || row?.month || ""),
    rentals: Number(row?.rentals || 0),
    revenue: Number(row?.revenue || 0),
    deposit: Number(row?.deposit || 0),
    cash: Number(row?.cash || 0),
    online: Number(row?.online ?? row?.upi ?? 0),
  }));

  const totals = chartData.reduce(
    (acc, row) => {
      acc.revenue += row.revenue;
      acc.rentals += row.rentals;
      acc.deposit += row.deposit;
      return acc;
    },
    { revenue: 0, rentals: 0, deposit: 0 }
  );

  const inrCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const moneyTick = (value) => {
    const n = Number(value || 0);
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
    return `₹${Math.round(n)}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Revenue</div>
          <div className="text-xl font-bold text-indigo-900">₹{inrCompact.format(totals.revenue)}</div>
        </div>
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/80 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Rentals</div>
          <div className="text-xl font-bold text-cyan-900">{inrCompact.format(totals.rentals)}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Deposits</div>
          <div className="text-xl font-bold text-emerald-900">₹{inrCompact.format(totals.deposit)}</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 18, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            yAxisId="money"
            tickLine={false}
            axisLine={false}
            tickFormatter={moneyTick}
            tick={{ fill: "#64748b", fontSize: 12 }}
            width={64}
          />
          <YAxis
            yAxisId="rides"
            orientation="right"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: "#6366f1", strokeDasharray: "4 4", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              const d = payload[0].payload || {};
              return (
                <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                  <div className="mb-1 font-semibold text-slate-700">{label}</div>
                  <div className="text-slate-600">Revenue: <span className="font-semibold text-slate-900">₹{inrCompact.format(d.revenue || 0)}</span></div>
                  <div className="text-slate-600">Rentals: <span className="font-semibold text-slate-900">{inrCompact.format(d.rentals || 0)}</span></div>
                  <div className="text-slate-600">Deposit: <span className="font-semibold text-slate-900">₹{inrCompact.format(d.deposit || 0)}</span></div>
                  <div className="text-slate-600">Cash: <span className="font-semibold text-slate-900">₹{inrCompact.format(d.cash || 0)}</span></div>
                  <div className="text-slate-600">Online: <span className="font-semibold text-slate-900">₹{inrCompact.format(d.online || 0)}</span></div>
                </div>
              );
            }}
          />

          <Bar
            yAxisId="money"
            dataKey="revenue"
            fill="#6366f1"
            barSize={22}
            radius={[8, 8, 0, 0]}
          />
          <Line
            yAxisId="rides"
            type="monotone"
            dataKey="rentals"
            stroke="#0ea5e9"
            strokeWidth={3}
            dot={{ r: 3, fill: "#0ea5e9" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function DailyRidesChart({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-gray-400">
        No rides data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
          }}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#2563eb"
          strokeWidth={3}
          dot={{ r: 3, fill: "#2563eb" }}
          activeDot={{ r: 5, fill: "#1d4ed8" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

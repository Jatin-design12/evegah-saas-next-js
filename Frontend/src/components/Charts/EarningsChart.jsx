import {
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const BAR_COLORS = ["#3b82f6", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

export default function EarningsChart({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-gray-400">
        No earnings data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
          }}
        />
        <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

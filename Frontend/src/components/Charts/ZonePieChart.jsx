import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

export default function ZonePieChart({ data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-gray-400">
        No zone data available
      </div>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="zone"
            outerRadius={90}
            labelLine={false}
            label={({ percent }) => `${Math.round((percent || 0) * 100)}%`}
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </>
  );
}

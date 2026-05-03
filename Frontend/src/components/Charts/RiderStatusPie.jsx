import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#22c55e", "#ef4444"];

export default function RiderStatusPie({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-gray-400">
        No status data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={100} innerRadius={56} labelLine={false}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
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
  );
}

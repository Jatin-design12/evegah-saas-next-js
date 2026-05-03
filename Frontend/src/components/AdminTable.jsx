export default function AdminTable({ columns, data }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/70">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-slate-700">
                  {row[col.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {data.length === 0 && (
        <div className="p-6 text-center text-sm text-slate-500">
          No records found
        </div>
      )}
    </div>
  );
}

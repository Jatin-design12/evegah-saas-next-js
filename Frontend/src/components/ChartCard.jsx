export default function ChartCard({
  id,
  title,
  subtitle,
  actions,
  children,
  bodyClassName = "",
}) {
  return (
    <section id={id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

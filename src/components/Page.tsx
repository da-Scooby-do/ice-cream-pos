// رأس الصفحة وهيكلها | page frame + header.

export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`p-5 lg:p-7 mx-auto space-y-5 animate-rise ${wide ? "max-w-[1500px]" : "max-w-[1240px]"}`}>{children}</main>;
}

export function PageHeader({
  title,
  sub,
  icon,
  actions,
}: {
  title: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      {icon && <div className="w-12 h-12 rounded-2xl bg-sky text-ink grid place-items-center shadow-sm">{icon}</div>}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {sub && <p className="text-sm text-ink-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex-1" />
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  tone = "plain",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "plain" | "good" | "bad" | "brand" | "dark";
  hint?: React.ReactNode;
}) {
  const tones = {
    plain: "bg-white",
    good: "bg-emerald-50 ring-1 ring-emerald-200",
    bad: "bg-red-50 ring-1 ring-red-200",
    brand: "bg-sky-50 ring-1 ring-sky-200",
    dark: "bg-ink-800 text-white",
  } as const;
  return (
    <div className={`rounded-3xl p-4 shadow-card ${tones[tone]}`}>
      <p className={`text-xs font-semibold ${tone === "dark" ? "text-ink-300" : "text-ink-400"}`}>{label}</p>
      <p className="text-2xl font-bold tnum mt-1 leading-tight">{value}</p>
      {hint && <p className={`text-xs mt-1 ${tone === "dark" ? "text-ink-300" : "text-ink-400"}`}>{hint}</p>}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
  pad = true,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          {title && <h2 className="font-bold">{title}</h2>}
          <div className="flex-1" />
          {actions}
        </div>
      )}
      <div className={pad ? "px-5 pb-5 pt-2" : ""}>{children}</div>
    </section>
  );
}

export default function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <div className="muted mt-1 text-sm">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3 print:hidden">{children}</div>}
    </div>
  );
}

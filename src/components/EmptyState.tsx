import PendingLink from "./PendingLink";

/** What to show when a list is empty: what it means, and the next thing to do. */
export default function EmptyState({
  icon,
  title,
  children,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border border-dashed border-brand-200 px-6 py-8 text-center dark:border-brand-800 ${className}`}>
      {icon && <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
      <p className="font-medium">{title}</p>
      {children && <p className="muted max-w-md text-sm">{children}</p>}
      {action && (
        <PendingLink href={action.href} className="btn-secondary mt-1 py-1.5 text-sm">
          {action.label}
        </PendingLink>
      )}
    </div>
  );
}

/** The app badge, in the style of the BMSCE seal. The cog ring turns light in dark mode. */
export default function AppLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.svg" alt="" className="h-full w-full dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-dark.svg" alt="" className="hidden h-full w-full dark:block" />
    </span>
  );
}

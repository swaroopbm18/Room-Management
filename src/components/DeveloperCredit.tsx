import Link from "next/link";

type Tone = "navy" | "light" | "ink";
type Credit = { label: string; name: string; initials: string; role: string; href: string; tone: Tone };

/** The developers and the mentor, each shown as a KPI-style card like the ones on the home page. */
const CREDITS: Credit[] = [
  {
    label: "Developed by",
    name: "Prof. Swaroop BM",
    initials: "SB",
    role: "Assistant Professor, Dept. of MEL, BMSCE",
    href: "https://bmsce.ac.in/home/facultyProfile/590/Swaroop-BM",
    tone: "navy",
  },
  {
    label: "Developed by",
    name: "Sinchana B M",
    initials: "SM",
    role: "Student, CSE (Data Science), BMSCE",
    href: "https://www.linkedin.com/in/sinchana-b-m-aa698a32b",
    tone: "light",
  },
  {
    label: "Mentored by",
    name: "Dr. Sandeep Varma N",
    initials: "SV",
    role: "HoD, Dept. of MEL, BMSCE",
    href: "https://bmsce.ac.in/home/facultyProfile/156/Dr-Sandeep-Varma-N",
    tone: "ink",
  },
];

// Same tones as the home page KPI cards (FacultyCard, KpiCard)
const TONES: Record<Tone, string> = {
  navy: "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-md shadow-brand-900/20",
  ink: "bg-gradient-to-br from-ink via-brand-950 to-brand-900 text-white shadow-md shadow-black/20 dark:border dark:border-brand-900",
  light: "card",
};

function CreditCard({ c }: { c: Credit }) {
  const dark = c.tone !== "light";
  return (
    <a
      href={c.href}
      target="_blank"
      rel="noopener"
      title={`${c.name}, ${c.role}`}
      className={`flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2 transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand-400 ${TONES[c.tone]}`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-semibold ${
          dark ? "bg-white/10 text-white" : "bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200"
        }`}
      >
        {c.initials}
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block text-[10px] font-semibold tracking-wider uppercase ${dark ? "text-brand-200" : "text-brand-600 dark:text-brand-300"}`}>{c.label}</span>
        <span className="block truncate text-sm font-semibold">{c.name}</span>
        <span className={`block truncate text-[11px] ${dark ? "text-brand-200/90" : "muted"}`}>{c.role}</span>
      </span>
    </a>
  );
}

/**
 * The credits at the bottom of every page: the developers and the mentor as KPI cards in one row,
 * and a Privacy button, at the end of every page so it never covers the content.
 */
export default function DeveloperCredit() {
  return (
    <footer className="z-30 border-t border-brand-100 bg-brand-50/90 backdrop-blur print:hidden dark:border-brand-900 dark:bg-black/85">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 sm:px-6 lg:flex-row lg:items-center lg:gap-3">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3 lg:gap-3">
          {CREDITS.map((c) => (
            <CreditCard key={c.name} c={c} />
          ))}
        </div>
        <Link href="/privacy" className="btn-primary shrink-0 justify-center self-end px-4 py-1.5 text-sm lg:self-center">
          Privacy
        </Link>
      </div>
    </footer>
  );
}

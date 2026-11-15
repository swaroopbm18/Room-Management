import Link from "next/link";

const DEVELOPERS = [
  {
    name: "Prof. Swaroop BM",
    initials: "SB",
    role: "Assistant Professor, Dept. of Machine Learning, BMSCE",
    href: "https://bmsce.ac.in/home/facultyProfile/590/Swaroop-BM",
  },
  {
    name: "Sinchana B M",
    initials: "SM",
    role: "Student, Computer Science and Engineering (Data Science), BMSCE",
    href: "https://www.linkedin.com/in/sinchana-b-m-aa698a32b",
  },
];

/** Acknowledged for mentoring the project. */
const MENTOR = {
  name: "Dr. Sandeep Varma N",
  initials: "SV",
  role: "HoD, Department of Machine Learning, BMSCE",
  href: "https://bmsce.ac.in/home/facultyProfile/156/Dr-Sandeep-Varma-N",
};

type Credit = typeof MENTOR;

function Chip({ d, title }: { d: Credit; title: string }) {
  return (
    <a
      href={d.href}
      target="_blank"
      rel="noopener"
      title={title}
      className="group flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-3 pl-0.5 ring-1 ring-white/15 transition hover:bg-white/10 hover:ring-brand-400"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[10px] font-semibold shadow-inner">
        {d.initials}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-xs font-semibold sm:text-sm">{d.name}</span>
        <span className="hidden truncate text-[11px] text-brand-200/80 lg:block">{d.role}</span>
      </span>
    </a>
  );
}

const LABEL = "shrink-0 text-[10px] font-semibold tracking-widest text-brand-300 uppercase sm:text-[11px]";

/** The "Developed by" credit and the mentor acknowledgement, pinned to the bottom of every page in the navbar's colours. */
export default function DeveloperCredit() {
  return (
    <footer className="sticky bottom-0 z-30 border-t border-white/10 bg-gradient-to-r from-ink via-brand-950 to-brand-800 text-white shadow-[0_-8px_24px_-12px_rgba(11,21,51,0.45)] print:hidden dark:border-brand-900/60 dark:from-black dark:via-black dark:to-brand-950">
      <div className="mx-auto flex max-w-7xl items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className={LABEL}>Developed by</span>
            {DEVELOPERS.map((d) => (
              <Chip key={d.name} d={d} title={`${d.name}, ${d.role}`} />
            ))}
          </div>
          {/* Acknowledgement: thanks to the HoD for mentoring the project */}
          <div className="flex min-w-0 items-center gap-x-3 sm:border-l sm:border-white/15 sm:pl-4">
            <span className={LABEL}>Mentored by</span>
            <Chip d={MENTOR} title={`With thanks to ${MENTOR.name}, ${MENTOR.role}, for mentoring`} />
          </div>
        </div>
        <Link href="/privacy" className="shrink-0 text-[11px] text-brand-200 underline-offset-2 hover:text-white hover:underline sm:text-xs">
          Privacy
        </Link>
      </div>
    </footer>
  );
}

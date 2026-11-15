import Link from "next/link";

type Credit = { name: string; role: string; href: string };

const DEVELOPERS: Credit[] = [
  {
    name: "Prof. Swaroop BM",
    role: "Assistant Professor, Dept. of ML",
    href: "https://bmsce.ac.in/home/facultyProfile/590/Swaroop-BM",
  },
  {
    name: "Sinchana B M",
    role: "Student, CSE (Data Science)",
    href: "https://www.linkedin.com/in/sinchana-b-m-aa698a32b",
  },
];

/** Acknowledged for mentoring the project. */
const MENTOR: Credit = {
  name: "Dr. Sandeep Varma N",
  role: "HoD, Dept. of ML",
  href: "https://bmsce.ac.in/home/facultyProfile/156/Dr-Sandeep-Varma-N",
};

const LABEL = "font-semibold text-brand-300";

/** A name linking to the person's profile, with their role after it. */
function Person({ c }: { c: Credit }) {
  return (
    <span>
      <a href={c.href} target="_blank" rel="noopener" className="font-semibold text-white underline-offset-2 hover:underline">
        {c.name}
      </a>
      <span className="text-brand-200/90">
        {" "}
        ({c.role}
        <span className="lg:hidden xl:inline">, BMSCE</span>)
      </span>
    </span>
  );
}

/**
 * The credits bar pinned to the bottom of every page: the developers with their roles, the
 * mentor, and a Privacy button, on one line on a laptop or wider (a phone or tablet wraps it).
 */
export default function DeveloperCredit() {
  return (
    <footer className="sticky bottom-0 z-30 border-t border-white/10 bg-gradient-to-r from-ink via-brand-950 to-brand-800 text-white shadow-[0_-8px_24px_-12px_rgba(11,21,51,0.45)] print:hidden dark:border-brand-900/60 dark:from-black dark:via-black dark:to-brand-950">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1.5 text-[11px] sm:px-6 2xl:text-xs">
        <div className="min-w-0 flex-1 leading-relaxed lg:overflow-x-auto lg:whitespace-nowrap lg:leading-normal lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
          <span className={LABEL}>Developed by</span>{" "}
          {DEVELOPERS.map((d, i) => (
            <span key={d.name}>
              {i > 0 && <span className="text-brand-300"> &amp; </span>}
              <Person c={d} />
            </span>
          ))}
          <span className="mx-2 hidden text-brand-400 lg:inline" aria-hidden>
            |
          </span>
          <br className="lg:hidden" />
          <span className={LABEL}>Mentored by</span> <Person c={MENTOR} />
        </div>
        <Link
          href="/privacy"
          className="shrink-0 rounded-full bg-white px-2.5 py-0.5 font-semibold text-brand-800 shadow-sm transition hover:bg-brand-100 dark:bg-brand-400 dark:text-black dark:hover:bg-brand-300"
        >
          Privacy
        </Link>
      </div>
    </footer>
  );
}

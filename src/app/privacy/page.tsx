import { IconFile, IconHistory, IconInfo, IconShield, IconUser, IconUsers } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

const SECTIONS = [
  {
    icon: IconInfo,
    title: "About this site",
    points: [
      "An internal tool of the Department of Machine Learning, B.M.S. College of Engineering, Bengaluru.",
      "Used to view classroom allotments and to request free rooms.",
    ],
  },
  {
    icon: IconUser,
    title: "What we collect",
    points: [
      "Students can use the site without signing in. Nothing is collected about them.",
      "Faculty and admins sign in with their @bmsce.ac.in Google account. We receive only their name and email address from Google.",
      "Room requests store the description entered and, for events, the uploaded approval letter.",
    ],
  },
  {
    icon: IconUsers,
    title: "How it is used",
    points: [
      "Only to manage room allotments: showing who a room is allotted to.",
      "Letting the HOD and Time Table Officers review and approve requests.",
      "Never shared outside the department, sold, or used for advertising.",
    ],
  },
  {
    icon: IconHistory,
    title: "Storage and retention",
    points: [
      "Data is stored with Supabase (database and files), in Mumbai. The site is hosted on Vercel.",
      "Allotment history is kept permanently as the department's record and cannot be edited by anyone.",
    ],
  },
  {
    icon: IconShield,
    title: "Cookies",
    points: [
      "Sign-in cookies keep faculty and admins logged in. Your light or dark theme choice is saved in your own browser.",
      "There are no tracking or advertising cookies.",
    ],
  },
  {
    icon: IconFile,
    title: "Contact",
    points: ["For questions or removal requests, contact the HOD, Department of Machine Learning, BMSCE."],
  },
];

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Privacy policy" subtitle="BMSCE Room Management, Department of Machine Learning" />
      <div className="grid gap-4">
        {SECTIONS.map(({ icon: Icon, title, points }, i) => (
          <section key={title} className="card flex gap-4 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">
                <span className="muted mr-1.5 font-normal">{i + 1}.</span>
                {title}
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-brand-500">
                {points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

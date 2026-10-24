import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Privacy policy" subtitle="BMSCE Room Management, Department of Machine Learning" />
      <div className="card space-y-4 p-6 text-sm leading-relaxed">
        <p>
          This website is an internal tool of the Department of Machine Learning, B.M.S. College of Engineering, Bengaluru,
          used to view classroom allotments and request free rooms.
        </p>
        <h2 className="text-base font-semibold">What we collect</h2>
        <p>
          Students can use the site without signing in, and nothing is collected about them. Faculty and admins sign in with
          their @bmsce.ac.in Google account; we receive only their name and email address from Google. Room requests store the
          description entered and, for events, the uploaded approval letter.
        </p>
        <h2 className="text-base font-semibold">How it is used</h2>
        <p>
          This information is used only to manage room allotments: showing who a room is allotted to, and letting the HOD and
          Time Table Officers review requests. It is not shared with anyone outside the department, sold, or used for advertising.
        </p>
        <h2 className="text-base font-semibold">Storage and retention</h2>
        <p>
          Data is stored with Supabase (database and files) and the site is hosted on Vercel. Allotment history is kept
          permanently as the department&apos;s record and cannot be edited.
        </p>
        <h2 className="text-base font-semibold">Contact</h2>
        <p>For questions or removal requests, contact the HOD, Department of Machine Learning, BMSCE.</p>
      </div>
    </div>
  );
}

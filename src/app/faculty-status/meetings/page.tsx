import AvailabilityTabs from "@/components/AvailabilityTabs";
import PageHeader from "@/components/PageHeader";
import { requireStaff } from "@/lib/auth";
import Meetings, { type MeetingSearch } from "../Meetings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Find a meeting time", robots: { index: false } };

/** Faculty availability, third view: the best meeting times over the next six working days. */
export default async function FindMeeting({ searchParams }: { searchParams: Promise<MeetingSearch> }) {
  const person = await requireStaff();
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader title="Faculty availability" subtitle="Who is free, and when the people you need can meet." />
      <AvailabilityTabs view="meetings" signedIn admin={person.role === "admin"} />
      <Meetings sp={sp} />
    </div>
  );
}

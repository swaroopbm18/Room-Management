import { redirect } from "next/navigation";

/** The faculty manual is now the Help page. */
export default function FacultyManual() {
  redirect("/help");
}

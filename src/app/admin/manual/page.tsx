import { redirect } from "next/navigation";

/** The admin manual is now the admin part of the Help page. */
export default function AdminManual() {
  redirect("/help#admin-start");
}

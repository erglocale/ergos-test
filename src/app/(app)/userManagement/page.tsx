import { redirect } from "next/navigation";

// Mirrors the original router: /userManagement redirects to /userManagement/users.
export default function Page() {
  redirect("/userManagement/users");
}

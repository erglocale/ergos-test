import { redirect } from "next/navigation";

// Mirrors the original router: /settings redirects to /settings/myProfile.
export default function Page() {
  redirect("/settings/myProfile");
}

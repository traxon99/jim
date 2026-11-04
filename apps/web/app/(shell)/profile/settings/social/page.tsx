import { redirect } from "next/navigation";

/** Settings → Social moved behind Share profile on your profile (#752). */
export default function SocialSettingsRedirect() {
  redirect("/profile?share=1");
}

import { ProfileHome } from "./profile-home";

// Profile is no longer a tab of its own — it's opened from the button in the
// Home tab's top-right corner, so it renders as a regular routed page.
export default function ProfilePage() {
  return <ProfileHome />;
}

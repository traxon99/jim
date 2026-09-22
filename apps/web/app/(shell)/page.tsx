import { redirect } from "next/navigation";

// The PWA's start_url. Launching the app lands on the Workout tab, which
// leads with the active program's suggested next workout.
export default function Home() {
  redirect("/workout");
}

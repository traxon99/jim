import { PortalCalendar } from "@/components/portal/portal-calendar";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadCalendarData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Calendar · Training analysis · Jim",
};

/** The Analysis Calendar section: the training heatmap, streak and achievements (issue #470). */
export default async function PortalCalendarPage() {
  try {
    return <PortalCalendar data={await loadCalendarData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/calendar");
    throw error;
  }
}

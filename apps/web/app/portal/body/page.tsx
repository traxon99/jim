import { PortalBody } from "@/components/portal/portal-body";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadBodyData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Body · Training analysis · Jim",
};

/** The Analysis Body section: bodyweight over time (issue #470). */
export default async function PortalBodyPage() {
  try {
    return <PortalBody data={await loadBodyData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/body");
    throw error;
  }
}

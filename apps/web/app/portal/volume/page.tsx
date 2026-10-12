import { PortalVolume } from "@/components/portal/portal-volume";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadVolumeData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Volume · Training analysis · Jim",
};

/** The Analysis Volume section: weekly sets per muscle against targets (issue #470). */
export default async function PortalVolumePage() {
  try {
    return <PortalVolume data={await loadVolumeData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/volume");
    throw error;
  }
}

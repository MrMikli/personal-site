import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import GauntletManagerClient from "./GauntletManagerClient";

export const dynamic = "force-dynamic";

export default async function AdminGauntletManagementPage() {
  const session = await getSession();
  if (!session?.user?.isAdmin) redirect("/");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Gauntlet Management</h1>
      <GauntletManagerClient />
    </div>
  );
}

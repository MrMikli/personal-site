import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import GauntletManagerClient from "./GauntletManagerClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function AdminGauntletManagementPage() {
  const session = await getSession();
  if (!session?.user?.isAdmin) redirect("/");

  return (
    <div className={styles.container}>
      <h1>Gauntlet Management</h1>
      <GauntletManagerClient />
    </div>
  );
}

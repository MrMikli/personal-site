import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyGauntletUserPage({ params, searchParams }) {
  const usernameOrId = params?.userId;
  const gauntletIdParam = typeof searchParams?.gauntletId === "string" ? searchParams.gauntletId : "";
  const suffix = gauntletIdParam ? `?gauntletId=${encodeURIComponent(gauntletIdParam)}` : "";

  if (!usernameOrId) {
    redirect("/gauntlet");
  }

  redirect(`/profile/${encodeURIComponent(usernameOrId)}${suffix}`);
}

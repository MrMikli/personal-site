import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import UserRollsClient from "./UserRollsClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function UserRollsPage({ params, searchParams }) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const usernameOrId = params?.userId;
  if (!usernameOrId) {
    redirect("/gauntlet");
  }

  const gauntletIdParam = typeof searchParams?.gauntletId === "string" ? searchParams.gauntletId : "";

  let viewedUser = await prisma.user.findUnique({
    where: { username: usernameOrId },
    select: { id: true, username: true }
  });

  // Back-compat: if someone hits the old /users/<id> URL, redirect to /users/<username>
  if (!viewedUser) {
    const byId = await prisma.user.findUnique({
      where: { id: usernameOrId },
      select: { id: true, username: true }
    });
    if (byId) {
      const suffix = gauntletIdParam ? `?gauntletId=${encodeURIComponent(gauntletIdParam)}` : "";
      redirect(`/gauntlet/users/${encodeURIComponent(byId.username)}${suffix}`);
    }
  }

  if (!viewedUser) {
    redirect("/gauntlet");
  }

  const gauntlets = await prisma.gauntlet.findMany({
    where: {
      OR: [
        { users: { some: { id: viewedUser.id } } },
        { heats: { some: { signups: { some: { userId: viewedUser.id } } } } }
      ]
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      heats: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          name: true,
          startsAt: true,
          endsAt: true,
          platforms: { select: { id: true, name: true, abbreviation: true } }
        }
      }
    }
  });

  const gauntletIds = gauntlets.map((g) => g.id);

  const signups = gauntletIds.length
    ? await prisma.heatSignup.findMany({
        where: {
          userId: viewedUser.id,
          heat: { gauntletId: { in: gauntletIds } }
        },
        select: {
          heatId: true,
          status: true,
          selectedGame: {
            select: {
              id: true,
              name: true,
              releaseDateUnix: true,
              releaseDateHuman: true,
              platforms: { select: { id: true, name: true, abbreviation: true } }
            }
          },
          rolls: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              game: {
                select: {
                  id: true,
                  name: true,
                  releaseDateUnix: true,
                  releaseDateHuman: true
                }
              },
              platform: { select: { id: true, name: true, abbreviation: true } }
            }
          }
        }
      })
    : [];

  const signupByHeatId = new Map(signups.map((s) => [s.heatId, s]));

  const shapedGauntlets = gauntlets.map((g) => ({
    ...g,
    heats: (g.heats || []).map((h) => ({
      ...h,
      signup: signupByHeatId.get(h.id) || null
    }))
  }));

  const initialGauntletId = gauntletIdParam;

  return (
    <div className={styles.container}>
      <div>
        <Link href="/gauntlet">← Back to gauntlet</Link>
      </div>
      <UserRollsClient user={viewedUser} gauntlets={shapedGauntlets} initialGauntletId={initialGauntletId} />
    </div>
  );
}

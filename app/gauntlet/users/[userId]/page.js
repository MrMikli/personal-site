import Link from "next/link";
import { redirect } from "next/navigation";
import path from "path";
import { access } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import UserRollsClient from "./UserRollsClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function findUserPublicImageSrc(username) {
  if (!username) return null;

  // Spec: match username exactly, with spaces converted to underscores.
  // Also guard against path separators.
  const base = username
    .replaceAll(" ", "_")
    .replaceAll("/", "_")
    .replaceAll("\\", "_");

  const exts = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

  for (const ext of exts) {
    const file = `${base}.${ext}`;
    const abs = path.join(process.cwd(), "public", file);
    try {
      await access(abs);
      return `/${encodeURIComponent(file)}`;
    } catch {
      // Not found
    }
  }

  return null;
}

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

  const userImageSrc = await findUserPublicImageSrc(viewedUser.username);

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
      {gauntletIdParam ? (
        <div>
          <Link href={`/gauntlet/scoreboard/${encodeURIComponent(gauntletIdParam)}`}>← Back to scoreboard</Link>
        </div>
      ) : null}
      {userImageSrc ? (
        <div className={styles.userImageWrap}>
          <img className={styles.userImage} src={userImageSrc} alt={viewedUser.username} />
        </div>
      ) : null}
      <UserRollsClient user={viewedUser} gauntlets={shapedGauntlets} initialGauntletId={initialGauntletId} />
    </div>
  );
}

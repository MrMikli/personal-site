import Link from "next/link";
import "./globals.css";
import { getSession } from "../lib/session";
import styles from "./layout.module.css";

export const metadata = {
  title: "Funny Games 1997",
  description: "Site for hosting Funny Games 1997 events and features.",
};

// Ensure the layout re-renders on each request/navigation so session changes are visible immediately
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }) {
  const session = await getSession();
  const user = session.user;
  return (
    <html lang="en">
      <body>
        <header className={styles.header}>
          <div className={styles.nav}>
            <Link href="/">Home</Link>
            <Link href="/roll-simulator">Roll simulator</Link>
            {user && <Link href="/gauntlet">Retro Game Gauntlet</Link>}
            {user?.isAdmin && <Link href="/admin">Admin</Link>}
          </div>
          <div className={styles.userArea}>
            {user ? (
              <>
                <span className={styles.signedInAs}>Signed in as {user.username}</span>
                <form action="/api/auth/logout" method="post">
                  <button type="submit">Logout</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login">Login</Link>
                <Link href="/register">Register</Link>
              </>
            )}
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}

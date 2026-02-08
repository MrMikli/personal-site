import Link from "next/link";
import "./globals.css";
import { getSession } from "../lib/session";
import styles from "./layout.module.css";
import AdminMaskToggle from "./AdminMaskToggle";

function PersonIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.58-4.5-8-4.5"
      />
    </svg>
  );
}

export const metadata = {
  title: "Funny Games 1997",
  description: "Site for hosting Funny Games 1997 events and features.",
  icons: {
    icon: "/wikchud.webp"
  }
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
                <Link href={`/gauntlet/users/${encodeURIComponent(user.username)}`} className={styles.userLink}>
                  <PersonIcon className={styles.userIcon} />
                  <span className={styles.username}>{user.username}</span>
                </Link>
                {user.isAdminActual && (
                  <AdminMaskToggle enabled={!!session.viewAsNonAdmin} />
                )}
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

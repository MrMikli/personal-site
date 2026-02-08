import Link from "next/link";
import "./globals.css";
import { getSession } from "../lib/session";

export const metadata = {
  title: "Mikli's Personal Website",
  description: "Personal site with auth scaffold"
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
        <header style={{ padding: "12px", borderBottom: "1px solid #eee", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/">Home</Link>
            <Link href="/roll-simulator">Roll simulator</Link>
            {user && <Link href="/gauntlet">Retro Game Gauntlet</Link>}
            {user?.isAdmin && <Link href="/admin">Admin</Link>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {user ? (
              <>
                <span style={{ opacity: 0.7 }}>Signed in as {user.username}</span>
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
        <main style={{ padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}

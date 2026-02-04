Mikli's Personal Website (Next.js)
=================================

Quick-start scaffold for a small personal site with email/password auth on Next.js (App Router), Prisma, PostgreSQL, and iron-session cookies.

Stack
- Next.js 14 (App Router)
- Prisma ORM
- PostgreSQL (Vercel Postgres/Neon/Supabase compatible)
- iron-session (encrypted cookie sessions)

Recommended Database
- Vercel Postgres (backed by Neon): best-integrated with Vercel, free hobby tier, easy env var setup, great DX. Alternatives: Supabase (Postgres + extras) or Neon directly.

Setup
1) Install dependencies
```bash
npm install
```

2) Configure environment
```bash
copy .env.example .env
# Fill DATABASE_URL and IRON_SESSION_PASSWORD (>= 32 chars)
```

3) Initialize database schema
```bash
npx prisma generate
npx prisma db push
# or use migrations:
# npx prisma migrate dev --name init
```

4) Run dev server
```bash
npm run dev
```

Pages
- / — Home
- /register — Create account
- /login — Sign in
- /protected — Requires authenticated session

Deploy (Vercel)
1) Push to a Git repository (GitHub etc.)
2) Import repo in Vercel
3) Add Environment Variables in Vercel Project Settings:
	- DATABASE_URL: From Vercel Postgres (Create → Storage → Postgres)
	- IRON_SESSION_PASSWORD: 32+ chars secret
4) Deploy

Notes
- Passwords are hashed with bcrypt. Sessions are stored in an encrypted, HttpOnly cookie via iron-session (no server session store needed).
- For analytics, consider Vercel Analytics (free basics) or Plausible (paid) later.
- To add UI/animations, you can layer Tailwind and a library like Framer Motion or GSAP.


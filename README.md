Mikli's Personal Website (Next.js)
=================================

Personal website to host funny projects and learn Next.js. Funny Games (1997).

How to Run Locally
------------------

Prerequisites
- Node.js 18+ and npm installed.
- A PostgreSQL database (Neon or local). The project already uses Neon via `DATABASE_URL`.

Setup
```bash
# 1) Install dependencies
npm install

# 2) Create environment file
# Place at project root as .env.local and include at minimum:
# DATABASE_URL=postgresql://<user>:<pass>@<host>/<db>?sslmode=require
```

Development
```bash
npm run dev
# Server: http://localhost:3000
```

Production (local)
```bash
# Build the app (also runs `prisma generate`)
npm run build

# Start the production server
npm run start
# Server: http://localhost:3000
```

Database / Prisma
- The app uses Prisma with PostgreSQL. Connection is via `DATABASE_URL` in `.env.local`.
- When you change the Prisma schema, sync the database:
```bash
# Push schema changes to the database
npx prisma db push

# (Optional) generate client manually
npx prisma generate
```

Useful Scripts
- `dev`: starts Next.js dev server with hot reload.
- `build`: generates Prisma client then builds the app.
- `start`: starts Next.js in production mode (requires `build`).
- `prisma:push`: `prisma db push` convenience alias.


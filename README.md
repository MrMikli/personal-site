Mikli's Personal Website (Next.js)
=================================

Personal website to host funny projects and learn Next.js. Funny Games (1997).

How to Run Locally
------------------

Prerequisites

- Node.js 24 (matches Vercel) and npm installed.
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

- The app uses Prisma with PostgreSQL. Connection is via `DATABASE_URL` in `.env.local` (Next.js) and `prisma/.env` (Prisma CLI); both point at the dev Neon branch.
- When you change the Prisma schema, create a migration and commit it with the schema change. Vercel applies committed migrations with `prisma migrate deploy` on every deploy.

```bash
# Create and apply a migration on the dev branch (also regenerates the client)
npm run prisma:migrate -- --name <short_snake_case_name>
```

- Do not use `prisma db push` for changes meant to ship: it changes the database without writing a migration, so production never receives the change.

Useful Scripts

- `dev`: starts Next.js dev server with hot reload.
- `build`: generates Prisma client then builds the app.
- `start`: starts Next.js in production mode (requires `build`).
- `test`: runs Jest.
- `test:watch`: runs Jest in watch mode.
- `prisma:migrate`: `prisma migrate dev`; creates and applies a migration on the dev database.
- `prisma:push`: `prisma db push`, for throwaway experiments only (see above).
- `lint:md`: lints every Markdown file with markdownlint.
- `db:seed`: recreates test players (`seed_*`, password `seed-password`) and `[seed]` gauntlets on the dev database. Only runs against the dev Neon branch; see `prisma/seed.mjs`.
- `db:seed:clean`: removes the seed data.

Testing
-------

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

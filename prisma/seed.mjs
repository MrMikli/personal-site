// Seeds the dev database with test players and gauntlets in every interesting state.
//
//   npm run db:seed          remove previous seed data, then recreate it
//   npm run db:seed:clean    only remove seed data
//
// Seed data is identified by the "seed_" username prefix and the "[seed]" gauntlet
// name prefix. Nothing else is touched, except that signups by other users in seed
// gauntlets are removed along with those gauntlets. Games and platforms are not
// created; run the IGDB sync from the admin page first.
//
// Heats are placed relative to today (UTC), so re-running the seed keeps a heat current.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Neon endpoint of the dev branch. The script refuses to run against any other host,
// so it can never write to production. Update this if the dev branch is recreated.
const DEV_DB_ENDPOINT = "ep-hidden-water-ag8mrjux";

const USER_PREFIX = "seed_";
const GAUNTLET_PREFIX = "[seed]";
const PASSWORD = "seed-password";
const BASE_POOL = 6;
const WHEEL_SIZE = 30;

const clean = process.argv.includes("--clean");

function assertDevDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set. Run through `npm run db:seed` so .env.local is loaded.");
  }
  const host = new URL(raw).hostname;
  if (!host.startsWith(DEV_DB_ENDPOINT)) {
    throw new Error(
      `Refusing to seed ${host}: it is not the dev branch endpoint (${DEV_DB_ENDPOINT}). ` +
        "If the dev branch was recreated, update DEV_DB_ENDPOINT in prisma/seed.mjs."
    );
  }
  return host;
}

const prisma = new PrismaClient();

function utcDay(offsetDays) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Matches REWARD_ROLL_POOL_PLUS_30 in effects/activate.
const REWARD_POOL_DELTA = 3;

function punishPoolDelta() {
  // Matches clampPoolMinus2 in the status route: -2, never below a pool of 1.
  return -Math.min(2, Math.max(0, BASE_POOL - 1));
}

async function removeSeedData() {
  const seedHeatFilter = { gauntlet: { name: { startsWith: GAUNTLET_PREFIX } } };
  const seedUserFilter = { username: { startsWith: USER_PREFIX } };
  const signupFilter = { OR: [{ heat: seedHeatFilter }, { user: seedUserFilter }] };

  // Heat, HeatSignup and HeatRoll relations do not cascade, so delete bottom-up.
  await prisma.heatRoll.deleteMany({ where: { heatSignup: signupFilter } });
  await prisma.heatSignup.deleteMany({ where: signupFilter });
  await prisma.heatEffect.deleteMany({ where: { OR: [{ heat: seedHeatFilter }, { user: seedUserFilter }] } });
  await prisma.gauntletEffect.deleteMany({
    where: { OR: [{ gauntlet: { name: { startsWith: GAUNTLET_PREFIX } } }, { user: seedUserFilter }] }
  });
  await prisma.heat.deleteMany({ where: seedHeatFilter });
  const gauntlets = await prisma.gauntlet.deleteMany({ where: { name: { startsWith: GAUNTLET_PREFIX } } });
  const users = await prisma.user.deleteMany({ where: seedUserFilter });
  return { gauntlets: gauntlets.count, users: users.count };
}

// Platforms ordered by how many games they have, so heats always have something to roll.
async function loadPlatforms() {
  const platforms = await prisma.platform.findMany({
    select: { id: true, name: true, rollYearEnd: true, _count: { select: { games: true } } }
  });
  const usable = platforms.filter((p) => p._count.games >= WHEEL_SIZE).sort((a, b) => b._count.games - a._count.games);
  if (!usable.length) {
    throw new Error("No platform has enough games. Sync games from IGDB on /admin/game-management first.");
  }
  return usable;
}

const gameIdCache = new Map();

async function eligibleGameIds(platform) {
  if (gameIdCache.has(platform.id)) return gameIdCache.get(platform.id);
  const cutoff =
    typeof platform.rollYearEnd === "number" ? Math.floor(Date.UTC(platform.rollYearEnd + 1, 0, 1) / 1000) : null;
  const rows = await prisma.game.findMany({
    where: {
      platforms: { some: { id: platform.id } },
      ...(cutoff != null ? { releaseDateUnix: { lt: cutoff } } : {})
    },
    select: { id: true }
  });
  const ids = rows.map((r) => r.id);
  gameIdCache.set(platform.id, ids);
  return ids;
}

// Creates rolls the way the roll route does: one HeatRoll per slot, each with a stored wheel
// whose chosen slot holds the rolled game.
async function createRolls(signupId, rollPlan) {
  const usedGameIds = new Set();
  const rolls = [];
  let order = 0;

  for (const { platform, source = "NORMAL", bonusHeatEffectId } of rollPlan) {
    const pool = shuffle((await eligibleGameIds(platform)).filter((id) => !usedGameIds.has(id)));
    const wheelGameIds = pool.slice(0, WHEEL_SIZE);
    const chosenIndex = Math.floor(Math.random() * wheelGameIds.length);
    const gameId = wheelGameIds[chosenIndex];
    usedGameIds.add(gameId);
    order += 1;

    rolls.push(
      await prisma.heatRoll.create({
        data: {
          heatSignupId: signupId,
          gameId,
          platformId: platform.id,
          order,
          source,
          ...(bonusHeatEffectId ? { bonusHeatEffectId } : {}),
          wheel: {
            create: {
              chosenIndex,
              gameIds: wheelGameIds,
              platformIds: wheelGameIds.map(() => platform.id)
            }
          }
        },
        select: { id: true, gameId: true }
      })
    );
  }

  return rolls;
}

// Splits a pool across platforms the way normalizeTargets does for an even request.
function splitTargets(platforms, pool) {
  const targets = Object.fromEntries(platforms.map((p) => [p.id, Math.floor(pool / platforms.length)]));
  for (let i = 0; i < pool % platforms.length; i++) targets[platforms[i].id] += 1;
  return targets;
}

function planFromTargets(platforms, targets, count) {
  const plan = platforms.flatMap((p) => Array.from({ length: targets[p.id] }, () => ({ platform: p })));
  return shuffle(plan).slice(0, count);
}

// One player's participation in one heat.
//   rolled:  how many of the pool to roll (defaults to the whole pool)
//   status:  UNBEATEN | BEATEN | GIVEN_UP (BEATEN and GIVEN_UP need a selected game, as in the app)
//   select:  pick a selected game from the rolls
async function createSignup({ heat, platforms, user, pool, rolled = pool, status = "UNBEATEN", select = false, extraRolls = [] }) {
  const targets = splitTargets(platforms, pool);
  const signup = await prisma.heatSignup.create({
    data: { heatId: heat.id, userId: user.id, status, platformTargets: targets, westernRequired: 0 }
  });
  const rolls = await createRolls(signup.id, [...planFromTargets(platforms, targets, rolled), ...extraRolls]);
  if (select || status !== "UNBEATEN") {
    await prisma.heatSignup.update({
      where: { id: signup.id },
      data: { selectedGameId: rolls[Math.floor(Math.random() * rolls.length)].gameId }
    });
  }
  return signup;
}

async function seed() {
  const platforms = await loadPlatforms();
  const pick = (i) => platforms[i % platforms.length];
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const userNames = ["admin", "alice", "bob", "carol", "dave", "erin"];
  const users = {};
  for (const name of userNames) {
    users[name] = await prisma.user.create({
      data: { username: `${USER_PREFIX}${name}`, passwordHash, isAdmin: name === "admin" }
    });
  }
  const players = [users.alice, users.bob, users.carol, users.dave, users.erin];

  // Main gauntlet: two finished heats, one running now, one upcoming.
  const gauntlet = await prisma.gauntlet.create({
    data: {
      name: `${GAUNTLET_PREFIX} Test Gauntlet`,
      effectsEnabled: true,
      users: { connect: players.map((u) => ({ id: u.id })) }
    }
  });

  const heatDefs = [
    { name: "Finished heat A", start: -21, end: -15, platforms: [pick(1)] },
    { name: "Finished heat B", start: -14, end: -3, platforms: [pick(2)] },
    { name: "Current heat", start: -2, end: 5, platforms: [pick(0), pick(1)] },
    { name: "Upcoming heat", start: 6, end: 12, platforms: [pick(3)] }
  ];
  const heats = [];
  for (const [i, def] of heatDefs.entries()) {
    heats.push(
      await prisma.heat.create({
        data: {
          gauntletId: gauntlet.id,
          name: def.name,
          order: i + 1,
          startsAt: utcDay(def.start),
          endsAt: utcDay(def.end),
          defaultGameCounter: BASE_POOL,
          platforms: { connect: def.platforms.map((p) => ({ id: p.id })) }
        }
      })
    );
  }
  const [h1, h2, h3] = heats;
  const p1 = heatDefs[0].platforms;
  const p2 = heatDefs[1].platforms;
  const p3 = heatDefs[2].platforms;
  const punished = BASE_POOL + punishPoolDelta();

  // A punishment as the status route stores it on the next heat after a give-up.
  const punish = (heat, user) =>
    prisma.heatEffect.create({
      data: { heatId: heat.id, userId: user.id, kind: "PUNISH_ROLL_POOL_MINUS_30", poolDelta: punishPoolDelta() }
    });

  // Heat A: everyone played.
  await createSignup({ heat: h1, platforms: p1, user: users.alice, pool: BASE_POOL, status: "BEATEN" });
  await createSignup({ heat: h1, platforms: p1, user: users.bob, pool: BASE_POOL, status: "BEATEN" });
  await createSignup({ heat: h1, platforms: p1, user: users.carol, pool: BASE_POOL, status: "GIVEN_UP" });
  await createSignup({ heat: h1, platforms: p1, user: users.dave, pool: BASE_POOL, status: "BEATEN" });
  await createSignup({ heat: h1, platforms: p1, user: users.erin, pool: BASE_POOL, status: "BEATEN" });

  // Heat B: carol plays with a reduced pool; erin never signed up, so she hits the
  // auto-timeout (GIVEN_UP + punishment) the first time she opens the current heat.
  await punish(h2, users.carol);
  await createSignup({ heat: h2, platforms: p2, user: users.alice, pool: BASE_POOL, status: "BEATEN" });
  await createSignup({ heat: h2, platforms: p2, user: users.bob, pool: BASE_POOL, status: "GIVEN_UP" });
  await createSignup({ heat: h2, platforms: p2, user: users.carol, pool: punished, status: "BEATEN" });
  await createSignup({ heat: h2, platforms: p2, user: users.dave, pool: BASE_POOL, status: "BEATEN" });

  // Current heat.
  // alice: activated +3 pool and a bonus roll, rolled everything, picked a game, still playing.
  const alicePlus = await prisma.heatEffect.create({
    data: { heatId: h3.id, userId: users.alice.id, kind: "REWARD_ROLL_POOL_PLUS_30", poolDelta: REWARD_POOL_DELTA }
  });
  const aliceBonus = await prisma.heatEffect.create({
    data: {
      heatId: h3.id,
      userId: users.alice.id,
      kind: "REWARD_BONUS_ROLL_PLATFORM",
      platformId: pick(2).id,
      remainingUses: 0,
      consumedAt: new Date()
    }
  });
  await createSignup({
    heat: h3,
    platforms: p3,
    user: users.alice,
    pool: BASE_POOL + alicePlus.poolDelta,
    select: true,
    extraRolls: [{ platform: pick(2), source: "BONUS", bonusHeatEffectId: aliceBonus.id }]
  });

  // bob: punished for giving up heat B, halfway through a smaller pool, nothing picked.
  await punish(h3, users.bob);
  await createSignup({ heat: h3, platforms: p3, user: users.bob, pool: punished, rolled: Math.ceil(punished / 2) });

  // carol: finished the current heat already.
  await createSignup({ heat: h3, platforms: p3, user: users.carol, pool: BASE_POOL, status: "BEATEN" });

  // dave: no signup yet, so the first-roll flow (platform targets, western minimum) is testable.
  // erin: see heat B.

  // Power-up inventory: alice has every kind; the others have one kind each to test buttons.
  const inventory = [
    [users.alice, "REWARD_ROLL_POOL_PLUS_30", 1],
    [users.alice, "REWARD_BONUS_ROLL_PLATFORM", 1],
    [users.alice, "REWARD_MOVE_WHEEL", 4],
    [users.alice, "REWARD_VETO_REROLL", 2],
    [users.bob, "REWARD_VETO_REROLL", 2],
    [users.carol, "REWARD_MOVE_WHEEL", 4],
    [users.dave, "REWARD_ROLL_POOL_PLUS_30", 1],
    [users.dave, "REWARD_BONUS_ROLL_PLATFORM", 1],
    [users.erin, "REWARD_MOVE_WHEEL", 4]
  ];
  await prisma.gauntletEffect.createMany({
    data: inventory.map(([user, kind, remainingUses]) => ({ gauntletId: gauntlet.id, userId: user.id, kind, remainingUses }))
  });

  // Second gauntlet with effects disabled, to check power-up UI and rewards stay hidden.
  const plain = await prisma.gauntlet.create({
    data: {
      name: `${GAUNTLET_PREFIX} No Effects Gauntlet`,
      effectsEnabled: false,
      users: { connect: [users.alice, users.bob].map((u) => ({ id: u.id })) }
    }
  });
  const plainHeat = await prisma.heat.create({
    data: {
      gauntletId: plain.id,
      name: "Current heat",
      order: 1,
      startsAt: utcDay(-2),
      endsAt: utcDay(5),
      defaultGameCounter: BASE_POOL,
      platforms: { connect: [{ id: pick(0).id }] }
    }
  });
  await createSignup({ heat: plainHeat, platforms: [pick(0)], user: users.alice, pool: BASE_POOL, rolled: 3 });

  return { platforms: [...new Set(heatDefs.flatMap((d) => d.platforms.map((p) => p.name)))] };
}

async function main() {
  const host = assertDevDatabase();
  console.log(`Database: ${host}`);

  const removed = await removeSeedData();
  console.log(`Removed ${removed.users} seed users and ${removed.gauntlets} seed gauntlets.`);
  if (clean) return;

  const { platforms } = await seed();
  console.log(`Seeded 6 users and 2 gauntlets using: ${platforms.join(", ")}`);
  console.log(`Log in as seed_alice, seed_bob, seed_carol, seed_dave, seed_erin or seed_admin (admin), password "${PASSWORD}".`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

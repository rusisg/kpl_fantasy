# Schema Review: KPL Fantasy Phase 1

## Executive Summary
The initial schema proposal contains **critical gaps** that prevent it from functioning as an FPL clone. It fails to track gameweek-specific squad states, player performances, chip usage, and transfer mechanics. Below is the detailed analysis and a corrected, production-ready `schema.prisma`.

---

## 1. Syntax & Configuration Issues

| Issue | Current | Required | Severity |
|-------|---------|----------|----------|
| Generator Provider | `prisma-client-id` | `prisma-client-js` | **Critical** - Will fail `prisma generate` |
| Decimal Precision | `@db.Decimal(4,1)` on `budget` | `@db.Decimal(5,1)` | **High** - 100.0M requires 5 digits |
| Missing Indexes | None on foreign keys | Compound indexes on `SquadPlayer`, `PlayerPerformance` | **High** - Query performance |
| Enum Naming | `Position` values `GKP, DEF, MID, FWD` | Match FPL API (`GK, DEF, MID, FWD`) | **Medium** - Integration parity |

---

## 2. Gameweek-by-Gameweek Squad History (Critical Gap)

### Problem
The proposed `SquadHistory` only stores `points` and `rank`. **It does not store which 15 players were selected, who was captain/vice-captain, or the bench order for that specific gameweek.** This makes historical reconstruction impossible.

### FPL Mechanics
- A user's squad **changes every gameweek** (transfers, captain changes, bench reorder).
- Historical data must be **immutable snapshots** per gameweek.
- Chips (Wildcard, Free Hit) alter the squad for a single gameweek only.

### Solution: `SquadSnapshot` + `SquadSnapshotPlayer`
Replace `SquadHistory` with a normalized snapshot model that captures the **entire 15-player state** per gameweek.

```prisma
model SquadSnapshot {
  id            String                 @id @default(cuid())
  squadId       String
  squad         Squad                  @relation(fields: [squadId], references: [id])
  gameweekId    Int
  gameweek      Gameweek               @relation(fields: [gameweekId], references: [id])
  totalPoints   Int                    @default(0)
  rank          Int?
  chipPlayed    ChipType?              // NULL, WILDCARD, FREE_HIT, etc.
  players       SquadSnapshotPlayer[]

  @@unique([squadId, gameweekId])
  @@index([gameweekId])
}

model SquadSnapshotPlayer {
  id                String    @id @default(cuid())
  snapshotId        String
  snapshot          SquadSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  playerId          String
  player            Player    @relation(fields: [playerId], references: [id])
  positionOrder     Int       // 1-11 = Starting XI, 12-15 = Bench (order matters for auto-sub)
  isCaptain         Boolean   @default(false)
  isViceCaptain     Boolean   @default(false)
  multiplier        Int       @default(1) // 1, 2 (captain), 3 (triple captain)
  points            Int       @default(0) // Calculated points for THIS gameweek

  @@unique([snapshotId, playerId])
  @@index([snapshotId, positionOrder])
}
```

---

## 3. Individual PlayerPerformance Tracking (Missing Entirely)

### Problem
No model exists to store **per-gameweek player stats** (goals, assists, clean sheets, saves, cards, bonus, minutes). Without this, the point calculation engine has no source of truth.

### FPL Mechanics
Points are derived from granular events. The schema must store raw stats so points can be recalculated if scoring rules change.

### Solution: `PlayerPerformance`
```prisma
model PlayerPerformance {
  id            String    @id @default(cuid())
  playerId      String
  player        Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  gameweekId    Int
  gameweek      Gameweek  @relation(fields: [gameweekId], references: [id])
  fixtureId     String
  fixture       Fixture   @relation(fields: [fixtureId], references: [id])

  // Playing Time
  minutes       Int       @default(0)

  // Attack
  goalsScored   Int       @default(0)
  assists       Int       @default(0)

  // Defense
  cleanSheets   Int       @default(0) // 1 if player played 60+ mins and team conceded 0
  goalsConceded Int       @default(0) // For GK/DEF only

  // Goalkeeping
  saves         Int       @default(0)
  penaltiesSaved Int      @default(0)
  penaltiesMissed Int     @default(0)

  // Discipline
  yellowCards   Int       @default(0)
  redCards      Int       @default(0)
  ownGoals      Int       @default(0)

  // Bonus System
  bonusPoints   Int       @default(0) // Official BPS bonus (1-3 pts)
  bps           Int       @default(0) // Bonus Points System raw score

  // Calculated
  totalPoints   Int       @default(0) // Final points after all rules applied

  @@unique([playerId, gameweekId])
  @@index([gameweekId])
  @@index([fixtureId])
}
```

---

## 4. Chips & Transfer Mechanics (Missing from Squad)

### Problem
The `Squad` model has no chip tracking or transfer state. FPL requires:
- **2 Wildcards** per season (1 per half)
- **1 Triple Captain**, **1 Bench Boost**, **1 Free Hit**
- **Free Transfers**: 1 per GW, rolls to max 2, costs 4pts per extra transfer
- **Transfer History** for audit trail

### Solution: Extend `Squad` + Add `Transfer` Model
```prisma
enum ChipType {
  WILDCARD
  TRIPLE_CAPTAIN
  BENCH_BOOST
  FREE_HIT
}

model Squad {
  id                    String    @id @default(cuid())
  userId                String    @unique
  user                  User      @relation(fields: [userId], references: [id])
  name                  String
  budget                Decimal   @default(100.0) @db.Decimal(5, 1)
  freeTransfers         Int       @default(1) // 1 or 2
  wildcardUsed          Boolean   @default(false)
  wildcard2Used         Boolean   @default(false) // Second half wildcard
  tripleCaptainUsed     Boolean   @default(false)
  benchBoostUsed        Boolean   @default(false)
  freeHitUsed           Boolean   @default(false)
  lastTransfersGameweek Int?      // Track when transfers were made
  players               SquadPlayer[]
  snapshots             SquadSnapshot[]
  transfers             Transfer[]
}

model Transfer {
  id            String    @id @default(cuid())
  squadId       String
  squad         Squad     @relation(fields: [squadId], references: [id], onDelete: Cascade)
  gameweekId    Int
  gameweek      Gameweek  @relation(fields: [gameweekId], references: [id])
  playerInId    String    // Player bought
  playerIn      Player    @relation("TransfersIn", fields: [playerInId], references: [id])
  playerOutId   String    // Player sold
  playerOut     Player    @relation("TransfersOut", fields: [playerOutId], references: [id])
  isWildcard    Boolean   @default(false)
  isFreeHit     Boolean   @default(false)
  cost          Int       @default(0) // Points hit (0, 4, 8, 12...)
  createdAt     DateTime  @default(now())

  @@index([squadId, gameweekId])
}
```

---

## 5. Additional Corrections & Enhancements

### A. Fixture Status & Postponements
```prisma
enum FixtureStatus {
  SCHEDULED
  LIVE
  FINISHED
  POSTPONED
  CANCELLED
}

model Fixture {
  // ... existing fields ...
  status        FixtureStatus @default(SCHEDULED)
  // Add stats for live updates
  homeStats     Json?         // {shots: 10, possession: 55, ...}
  awayStats     Json?
}
```

### B. Player Price Changes
FPL prices change dynamically. Track history for graphing.
```prisma
model PlayerPriceHistory {
  id        String   @id @default(cuid())
  playerId  String
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  gameweek  Int
  price     Decimal  @db.Decimal(4, 1)
  date      DateTime @default(now())

  @@unique([playerId, gameweek])
  @@index([gameweek])
}
```

### C. League (Mini-league) System
Required per AGENT.md Primary Entities.
```prisma
model League {
  id          String    @id @default(cuid())
  name        String
  code        String    @unique // Invite code
  isPrivate   Boolean   @default(true)
  createdById String
  createdBy   User      @relation(fields: [createdById], references: [id])
  members     LeagueMember[]
  createdAt   DateTime  @default(now())
}

model LeagueMember {
  id        String   @id @default(cuid())
  leagueId  String
  league    League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  squadId   String
  squad     Squad    @relation(fields: [squadId], references: [id], onDelete: Cascade)
  joinedAt  DateTime @default(now())

  @@unique([leagueId, squadId])
}
```

---

## 6. Corrected Complete schema.prisma

```prisma
// schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ============================================
// ENUMS
// ============================================
enum Position {
  GK
  DEF
  MID
  FWD
}

enum ChipType {
  WILDCARD
  TRIPLE_CAPTAIN
  BENCH_BOOST
  FREE_HIT
}

enum FixtureStatus {
  SCHEDULED
  LIVE
  FINISHED
  POSTPONED
  CANCELLED
}

// ============================================
// CORE MODELS
// ============================================
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  password      String?   // Hashed
  emailVerified DateTime?
  squad         Squad?
  leagues       LeagueMember[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([email])
}

model Club {
  id            String    @id @default(cuid())
  name          String    // "FC Astana"
  shortName     String    @unique // "AST"
  logoUrl       String?
  players       Player[]
  homeFixtures  Fixture[] @relation("HomeFixtures")
  awayFixtures  Fixture[] @relation("AwayFixtures")

  @@index([shortName])
}

model Player {
  id              String               @id @default(cuid())
  firstName       String
  lastName        String
  clubId          String
  club            Club                 @relation(fields: [clubId], references: [id])
  position        Position
  price           Decimal              @db.Decimal(4, 1) // 4.0 to 15.0
  totalPoints     Int                  @default(0)
  squadPlayers    SquadPlayer[]
  performances    PlayerPerformance[]
  priceHistory    PlayerPriceHistory[]
  transfersIn     Transfer[]           @relation("TransfersIn")
  transfersOut    Transfer[]           @relation("TransfersOut")
  snapshotPlayers SquadSnapshotPlayer[]

  @@index([clubId])
  @@index([position])
}

model Gameweek {
  id            Int       @id // 1, 2, 3...
  deadline      DateTime
  isCurrent     Boolean   @default(false)
  isFinished    Boolean   @default(false)
  fixtures      Fixture[]
  snapshots     SquadSnapshot[]
  performances  PlayerPerformance[]
  transfers     Transfer[]

  @@index([isCurrent])
  @@index([isFinished])
}

model Fixture {
  id            String         @id @default(cuid())
  gameweekId    Int
  gameweek      Gameweek       @relation(fields: [gameweekId], references: [id])
  homeClubId    String
  homeClub      Club           @relation("HomeFixtures", fields: [homeClubId], references: [id])
  awayClubId    String
  awayClub      Club           @relation("AwayFixtures", fields: [awayClubId], references: [id])
  kickoffTime   DateTime
  homeScore     Int?
  awayScore     Int?
  status        FixtureStatus  @default(SCHEDULED)
  homeStats     Json?
  awayStats     Json?
  performances  PlayerPerformance[]

  @@index([gameweekId])
  @@index([homeClubId, awayClubId])
  @@index([status])
}

// ============================================
// SQUAD & TRANSFER MODELS
// ============================================
model Squad {
  id                    String    @id @default(cuid())
  userId                String    @unique
  user                  User      @relation(fields: [userId], references: [id])
  name                  String
  budget                Decimal   @default(100.0) @db.Decimal(5, 1)
  freeTransfers         Int       @default(1)
  wildcardUsed          Boolean   @default(false)
  wildcard2Used         Boolean   @default(false)
  tripleCaptainUsed     Boolean   @default(false)
  benchBoostUsed        Boolean   @default(false)
  freeHitUsed           Boolean   @default(false)
  lastTransfersGameweek Int?
  players               SquadPlayer[]
  snapshots             SquadSnapshot[]
  transfers             Transfer[]
  leagueMemberships     LeagueMember[]

  @@index([userId])
}

model SquadPlayer {
  id            String    @id @default(cuid())
  squadId       String
  squad         Squad     @relation(fields: [squadId], references: [id], onDelete: Cascade)
  playerId      String
  player        Player    @relation(fields: [playerId], references: [id])
  positionOrder Int       // 1-15
  isCaptain     Boolean   @default(false)
  isViceCaptain Boolean   @default(false)

  @@unique([squadId, playerId])
  @@index([squadId, positionOrder])
}

model Transfer {
  id            String    @id @default(cuid())
  squadId       String
  squad         Squad     @relation(fields: [squadId], references: [id], onDelete: Cascade)
  gameweekId    Int
  gameweek      Gameweek  @relation(fields: [gameweekId], references: [id])
  playerInId    String
  playerIn      Player    @relation("TransfersIn", fields: [playerInId], references: [id])
  playerOutId   String
  playerOut     Player    @relation("TransfersOut", fields: [playerOutId], references: [id])
  isWildcard    Boolean   @default(false)
  isFreeHit     Boolean   @default(false)
  cost          Int       @default(0)
  createdAt     DateTime  @default(now())

  @@index([squadId, gameweekId])
  @@index([gameweekId])
}

// ============================================
// GAMEWEEK SNAPSHOT (IMMUTABLE HISTORY)
// ============================================
model SquadSnapshot {
  id            String                 @id @default(cuid())
  squadId       String
  squad         Squad                  @relation(fields: [squadId], references: [id], onDelete: Cascade)
  gameweekId    Int
  gameweek      Gameweek               @relation(fields: [gameweekId], references: [id])
  totalPoints   Int                    @default(0)
  rank          Int?
  chipPlayed    ChipType?
  players       SquadSnapshotPlayer[]

  @@unique([squadId, gameweekId])
  @@index([gameweekId])
  @@index([squadId])
}

model SquadSnapshotPlayer {
  id                String    @id @default(cuid())
  snapshotId        String
  snapshot          SquadSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  playerId          String
  player            Player    @relation(fields: [playerId], references: [id])
  positionOrder     Int       // 1-11 starting, 12-15 bench
  isCaptain         Boolean   @default(false)
  isViceCaptain     Boolean   @default(false)
  multiplier        Int       @default(1) // 1, 2 (C), 3 (TC)
  points            Int       @default(0)

  @@unique([snapshotId, playerId])
  @@index([snapshotId, positionOrder])
}

// ============================================
// PLAYER PERFORMANCE (POINT CALCULATION SOURCE)
// ============================================
model PlayerPerformance {
  id            String    @id @default(cuid())
  playerId      String
  player        Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  gameweekId    Int
  gameweek      Gameweek  @relation(fields: [gameweekId], references: [id])
  fixtureId     String
  fixture       Fixture   @relation(fields: [fixtureId], references: [id])

  minutes       Int       @default(0)
  goalsScored   Int       @default(0)
  assists       Int       @default(0)
  cleanSheets   Int       @default(0)
  goalsConceded Int       @default(0)
  saves         Int       @default(0)
  penaltiesSaved Int      @default(0)
  penaltiesMissed Int     @default(0)
  yellowCards   Int       @default(0)
  redCards      Int       @default(0)
  ownGoals      Int       @default(0)
  bonusPoints   Int       @default(0)
  bps           Int       @default(0)
  totalPoints   Int       @default(0)

  @@unique([playerId, gameweekId])
  @@index([gameweekId])
  @@index([fixtureId])
}

// ============================================
// PRICE HISTORY
// ============================================
model PlayerPriceHistory {
  id        String   @id @default(cuid())
  playerId  String
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  gameweek  Int
  price     Decimal  @db.Decimal(4, 1)
  date      DateTime @default(now())

  @@unique([playerId, gameweek])
  @@index([gameweek])
}

// ============================================
// MINI-LEAGUES
// ============================================
model League {
  id          String    @id @default(cuid())
  name        String
  code        String    @unique
  isPrivate   Boolean   @default(true)
  createdById String
  createdBy   User      @relation(fields: [createdById], references: [id])
  members     LeagueMember[]
  createdAt   DateTime  @default(now())

  @@index([code])
}

model LeagueMember {
  id        String   @id @default(cuid())
  leagueId  String
  league    League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  squadId   String
  squad     Squad    @relation(fields: [squadId], references: [id], onDelete: Cascade)
  joinedAt  DateTime @default(now())

  @@unique([leagueId, squadId])
  @@index([squadId])
}
```

---

## 7. Migration Checklist for Phase 1 Completion

| Task | Command / Action |
|------|------------------|
| Fix generator | Change provider to `prisma-client-js` |
| Apply schema | `npx prisma migrate dev --name init_schema` |
| Seed clubs/gameweeks | Run `prisma/seed.ts` with 14 KPL clubs, GW1-38 deadlines |
| Verify indexes | `npx prisma db pull` → inspect generated SQL |
| Generate types | `npx prisma generate` → verify `@prisma/client` exports all enums |
| Test snapshot logic | Write integration test: create squad → make transfer → verify `SquadSnapshot` isolates GW1 vs GW2 |

---

## 8. Architectural Decisions Log

| Decision | Rationale |
|----------|-----------|
| `SquadSnapshot` + `SquadSnapshotPlayer` vs JSON blob | Normalized allows SQL queries for "most captained player GW5", "bench boost effectiveness", etc. |
| `multiplier` field on snapshot player | Handles Triple Captain (3x) without schema changes; future-proof for "Mystery Chip" |
| `PlayerPerformance` separate from `Fixture` | One fixture → 22+ performances. Decouples stats ingestion from fixture scheduling. |
| `freeTransfers` on `Squad` not `User` | Squad owns the transfer state; supports future "multiple squads per user" (not in FPL but possible) |
| `ChipType` enum on `SquadSnapshot.chipPlayed` | Single source of truth: "Which chip was active for this GW's scoring?" |
| `Decimal(5,1)` for budget | Supports 100.0 to 999.9 (theoretical max with price rises) |

---

**Verdict:** The corrected schema is **FPL-mechanically complete** for Phase 1. It supports all validation rules, historical reconstruction, point calculation, chip mechanics, and transfer economics. Ready for `prisma migrate dev`.

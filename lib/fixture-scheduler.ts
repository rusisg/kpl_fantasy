/**
 * Deterministic double round-robin fixture generator (circle method).
 * Pure TypeScript — no Prisma imports — so it is unit-testable and reusable
 * by the seed script and any future admin tooling.
 *
 * For N clubs (N even) this yields 2 * (N - 1) rounds with N / 2 matches each.
 * Every club plays every other club exactly twice: once at home, once away.
 * For an odd N a virtual "BYE" slot is inserted and its matches are dropped.
 */

export interface ScheduledMatch {
  round: number; // 1-based gameweek number
  homeIndex: number; // index into the input clubs array
  awayIndex: number;
}

const BYE = -1;

export function generateDoubleRoundRobin(clubCount: number): ScheduledMatch[] {
  if (!Number.isInteger(clubCount) || clubCount < 2) {
    throw new Error("generateDoubleRoundRobin requires at least 2 clubs.");
  }

  const slots: number[] = Array.from({ length: clubCount }, (_, i) => i);
  if (slots.length % 2 !== 0) slots.push(BYE);

  const n = slots.length;
  const roundsPerLeg = n - 1;
  const firstLeg: ScheduledMatch[] = [];

  // Rotate every slot except the first (fixed pivot).
  let rotation = slots.slice();
  for (let round = 0; round < roundsPerLeg; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a === BYE || b === BYE) continue;

      // Balance home/away: the pivot pair alternates by round, other pairs flip
      // orientation by pair index. Because clubs rotate through pair slots each
      // round, this keeps every club's home/away streak at most 3 (incl. leg break).
      const swap = i === 0 ? round % 2 === 1 : i % 2 === 1;
      firstLeg.push({
        round: round + 1,
        homeIndex: swap ? b : a,
        awayIndex: swap ? a : b,
      });
    }

    const [pivot, ...rest] = rotation;
    rest.unshift(rest.pop() as number);
    rotation = [pivot, ...rest];
  }

  const secondLeg: ScheduledMatch[] = firstLeg.map((m) => ({
    round: m.round + roundsPerLeg,
    homeIndex: m.awayIndex,
    awayIndex: m.homeIndex,
  }));

  return [...firstLeg, ...secondLeg];
}

export function totalRoundsFor(clubCount: number): number {
  const n = clubCount % 2 === 0 ? clubCount : clubCount + 1;
  return 2 * (n - 1);
}

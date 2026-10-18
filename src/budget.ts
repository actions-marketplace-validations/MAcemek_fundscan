import { UsageError } from './errors.js';

export const MAX_BUDGET_CENTS = 1_000_000_000;

/** Parses "100", "49.9" or "49.99" into cents. */
export function parseBudget(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match?.[1]) {
    throw new UsageError(
      `Invalid budget "${value}". Use a positive amount with up to two decimals, for example 100 or 49.99.`,
    );
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (cents <= 0 || cents > MAX_BUDGET_CENTS) {
    throw new UsageError(
      `Invalid budget "${value}". It must be greater than 0 and at most 10000000.`,
    );
  }
  return cents;
}

function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b);
}

/**
 * Exact integer weights for the budget split. Every funded dependency gets an equal share,
 * divided equally between its own destinations; a destination's weight is the sum of the shares
 * it receives. `coverage` holds the destination keys of each dependency (empty lists are ignored).
 * Shares are scaled by the least common multiple of the list lengths so they stay integers.
 */
export function budgetWeights(coverage: string[][], destinationKeys: string[]): bigint[] {
  const funded = coverage.filter((keys) => keys.length > 0);
  let lcm = 1n;
  for (const keys of funded) {
    const length = BigInt(keys.length);
    lcm = (lcm / gcd(lcm, length)) * length;
  }
  const byKey = new Map<string, bigint>(destinationKeys.map((key) => [key, 0n]));
  for (const keys of funded) {
    const share = lcm / BigInt(keys.length);
    for (const key of keys) byKey.set(key, (byKey.get(key) ?? 0n) + share);
  }
  return destinationKeys.map((key) => byKey.get(key) ?? 0n);
}

/**
 * Splits `totalCents` proportionally to `weights` with the largest remainder method.
 * The parts always add up to `totalCents`; ties go to the earlier (higher ranked) entry.
 */
export function splitBudget(totalCents: number, weights: bigint[]): number[] {
  const total = BigInt(totalCents);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight <= 0n) return weights.map(() => 0);
  const parts = weights.map((weight) => (total * weight) / totalWeight);
  const remainders = weights.map((weight, index) => ({
    index,
    remainder: (total * weight) % totalWeight,
  }));
  let left = total - parts.reduce((sum, part) => sum + part, 0n);
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const { index } of remainders) {
    if (left <= 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    left--;
  }
  return parts.map(Number);
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

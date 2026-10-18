import { describe, expect, it } from 'vitest';
import { budgetWeights, formatCents, parseBudget, splitBudget } from '../src/budget.js';
import { UsageError } from '../src/errors.js';

describe('parseBudget', () => {
  it('parses whole and decimal amounts into cents', () => {
    expect(parseBudget('100')).toBe(10_000);
    expect(parseBudget('49.9')).toBe(4_990);
    expect(parseBudget('49.99')).toBe(4_999);
    expect(parseBudget(' 0.01 ')).toBe(1);
  });

  it.each(['0', '0.00', '-5', '1.234', 'abc', '', '1e3', '10000000.01'])('rejects %j', (value) => {
    expect(() => parseBudget(value)).toThrow(UsageError);
  });
});

describe('budgetWeights', () => {
  it('gives every funded dependency the same total weight', () => {
    const keys = ['a', 'b', 'c', 'd', 'x'];
    expect(budgetWeights([['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], ['x']], keys)).toEqual([
      2n,
      2n,
      2n,
      2n,
      4n,
    ]);
  });

  it('uses the least common multiple of the list lengths and ignores unfunded dependencies', () => {
    expect(budgetWeights([['a', 'b'], ['a', 'b', 'c'], []], ['a', 'b', 'c', 'z'])).toEqual([
      5n,
      5n,
      2n,
      0n,
    ]);
    expect(budgetWeights([], [])).toEqual([]);
  });
});

describe('splitBudget', () => {
  it('splits proportionally and always sums to the total', () => {
    expect(splitBudget(10_000, [4n, 3n, 1n, 1n, 1n])).toEqual([4_000, 3_000, 1_000, 1_000, 1_000]);
    expect(splitBudget(10_000, [1n, 1n, 1n])).toEqual([3_334, 3_333, 3_333]);
    expect(splitBudget(100, [2n, 1n, 1n, 1n, 1n, 1n])).toEqual([29, 15, 14, 14, 14, 14]);
  });

  it('gives remainders to the largest fractions first', () => {
    const parts = splitBudget(1_000, [5n, 3n, 3n]);
    expect(parts).toEqual([454, 273, 273]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000);
  });

  it('splits a budget so that extra links do not earn extra money', () => {
    const weights = budgetWeights(
      [['tidelift', 'eslint', 'oc', 'donate'], ['tidelift', 'eslint', 'oc', 'donate'], ['serde']],
      ['tidelift', 'eslint', 'oc', 'donate', 'serde'],
    );
    expect(splitBudget(9_000, weights)).toEqual([1_500, 1_500, 1_500, 1_500, 3_000]);
  });

  it('stays exact for the largest budget and large weights', () => {
    const parts = splitBudget(1_000_000_000, [123_456_789_012n, 987_654_321_098n, 1n]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_000_000);
  });

  it('handles empty and zero weights', () => {
    expect(splitBudget(1_000, [])).toEqual([]);
    expect(splitBudget(1_000, [0n, 0n])).toEqual([0, 0]);
  });
});

describe('formatCents', () => {
  it('formats with two decimals and no grouping', () => {
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(123_456_789)).toBe('1234567.89');
  });
});

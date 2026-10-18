import { describe, expect, it } from 'vitest';
import { evaluateHealth } from '../src/health.js';
import type { PackageInfo } from '../src/types.js';

const NOW = new Date('2026-10-18T00:00:00Z');

const healthy: PackageInfo = {
  status: null,
  fundingLinks: [],
  latestReleaseAt: '2026-09-01T00:00:00Z',
  repositoryUrl: null,
  registryUrl: null,
  archived: false,
  pushedAt: '2026-10-01T00:00:00Z',
  commitStats: { totalCommits: 500, totalCommitters: 40, dds: 0.5 },
};

describe('evaluateHealth', () => {
  it('returns no flags for a healthy package', () => {
    expect(evaluateHealth(healthy, NOW)).toEqual([]);
  });

  it('flags unknown packages', () => {
    expect(evaluateHealth(undefined, NOW)).toEqual([
      { id: 'unknown', detail: 'not found on ecosyste.ms' },
    ]);
  });

  it('flags deprecated statuses, ignoring case', () => {
    expect(evaluateHealth({ ...healthy, status: 'Deprecated' }, NOW)).toEqual([
      { id: 'deprecated', detail: 'status: Deprecated' },
    ]);
    expect(evaluateHealth({ ...healthy, status: 'removed' }, NOW)[0]?.id).toBe('deprecated');
    expect(evaluateHealth({ ...healthy, status: 'active' }, NOW)).toEqual([]);
  });

  it('flags archived repositories', () => {
    expect(evaluateHealth({ ...healthy, archived: true }, NOW)).toEqual([
      { id: 'archived', detail: 'repository archived' },
    ]);
  });

  it('flags stale packages only when both release and push are old', () => {
    const old = { ...healthy, latestReleaseAt: '2020-01-01T00:00:00Z' };
    expect(evaluateHealth(old, NOW)).toEqual([]);
    expect(evaluateHealth({ ...old, pushedAt: '2024-10-17T00:00:00Z' }, NOW)).toEqual([
      { id: 'stale', detail: 'no release or push since 2024-10-17' },
    ]);
    expect(evaluateHealth({ ...old, pushedAt: '2024-10-19T00:00:00Z' }, NOW)).toEqual([]);
    expect(evaluateHealth({ ...old, pushedAt: null }, NOW)[0]?.id).toBe('stale');
    expect(evaluateHealth({ ...old, latestReleaseAt: null, pushedAt: null }, NOW)).toEqual([]);
  });

  it('flags concentrated authorship above the commit minimum', () => {
    const concentrated = {
      ...healthy,
      commitStats: { totalCommits: 684, totalCommitters: 24, dds: 0.0438 },
    };
    expect(evaluateHealth(concentrated, NOW)).toEqual([
      { id: 'concentrated', detail: 'top committer wrote 95% of 684 commits' },
    ]);
    const small = { ...healthy, commitStats: { totalCommits: 19, totalCommitters: 1, dds: 0 } };
    expect(evaluateHealth(small, NOW)).toEqual([]);
    const borderline = {
      ...healthy,
      commitStats: { totalCommits: 100, totalCommitters: 5, dds: 0.1 },
    };
    expect(evaluateHealth(borderline, NOW)).toEqual([
      { id: 'concentrated', detail: 'top committer wrote 90% of 100 commits' },
    ]);
    const spread = {
      ...healthy,
      commitStats: { totalCommits: 100, totalCommitters: 5, dds: 0.11 },
    };
    expect(evaluateHealth(spread, NOW)).toEqual([]);
  });

  it('returns flags in a fixed order', () => {
    const everything: PackageInfo = {
      ...healthy,
      status: 'deprecated',
      archived: true,
      latestReleaseAt: '2018-01-01T00:00:00Z',
      pushedAt: '2019-01-01T00:00:00Z',
      commitStats: { totalCommits: 100, totalCommitters: 1, dds: 0 },
    };
    expect(evaluateHealth(everything, NOW).map((f) => f.id)).toEqual([
      'deprecated',
      'archived',
      'stale',
      'concentrated',
    ]);
  });
});

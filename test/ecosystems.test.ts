import { describe, expect, it } from 'vitest';
import {
  BULK_LOOKUP_URL,
  lookupPackages,
  recordKey,
  toPackageInfo,
  toPurl,
  type FetchFn,
} from '../src/ecosystems.js';
import { ApiError } from '../src/errors.js';
import { USER_AGENT } from '../src/version.js';
import { createFixtureFetch, loadFixture } from './helpers/fixture-fetch.js';

const NOW = new Date('2026-10-18T12:00:00Z');

function scriptedFetch(responses: (Response | Error)[], calls: RequestInit[] = []): FetchFn {
  return async (_input, init) => {
    calls.push(init ?? {});
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  };
}

function lookupDeps(fetchFn: FetchFn, sleeps: number[] = []) {
  return {
    fetch: fetchFn,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    now: () => NOW,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

describe('toPurl', () => {
  it('builds purls for every ecosystem', () => {
    expect(toPurl('npm', 'express')).toBe('pkg:npm/express');
    expect(toPurl('npm', '@types/node')).toBe('pkg:npm/%40types/node');
    expect(toPurl('pypi', 'typing-extensions')).toBe('pkg:pypi/typing-extensions');
    expect(toPurl('cargo', 'serde_json')).toBe('pkg:cargo/serde_json');
    expect(toPurl('go', 'github.com/spf13/cobra')).toBe('pkg:golang/github.com/spf13/cobra');
  });
});

describe('toPackageInfo', () => {
  it('reads the fields fundscan uses', () => {
    expect(
      toPackageInfo({
        status: 'deprecated',
        funding_links: ['https://github.com/sponsors/a', 5],
        latest_release_published_at: '2020-01-01T00:00:00.000Z',
        repository_url: 'https://github.com/a/b',
        registry_url: '',
        repo_metadata: {
          archived: true,
          pushed_at: '2021-01-01T00:00:00.000Z',
          commit_stats: { total_commits: 50, total_committers: '3', dds: '0.05' },
        },
      }),
    ).toEqual({
      status: 'deprecated',
      fundingLinks: ['https://github.com/sponsors/a'],
      latestReleaseAt: '2020-01-01T00:00:00.000Z',
      repositoryUrl: 'https://github.com/a/b',
      registryUrl: null,
      archived: true,
      pushedAt: '2021-01-01T00:00:00.000Z',
      commitStats: { totalCommits: 50, totalCommitters: 3, dds: 0.05 },
    });
  });

  it('tolerates missing repository data', () => {
    const info = toPackageInfo({ repo_metadata: null });
    expect(info.archived).toBe(false);
    expect(info.pushedAt).toBeNull();
    expect(info.commitStats).toBeNull();
    expect(info.fundingLinks).toEqual([]);
    expect(
      toPackageInfo({ repo_metadata: { commit_stats: { dds: null } } }).commitStats,
    ).toBeNull();
  });
});

describe('recordKey', () => {
  it('normalizes PyPI names and rejects other registries', () => {
    expect(recordKey({ ecosystem: 'pypi', name: 'zope.interface' })).toBe('pypi:zope-interface');
    expect(recordKey({ ecosystem: 'npm', name: 'a', registry: { name: 'npmjs.org' } })).toBe(
      'npm:a',
    );
    expect(recordKey({ ecosystem: 'npm', name: 'a', registry: { name: 'npm.example' } })).toBe(
      null,
    );
    expect(recordKey({ ecosystem: 'maven', name: 'a' })).toBe(null);
  });
});

describe('lookupPackages', () => {
  it('posts purls to the bulk lookup endpoint and keys results', async () => {
    const calls: RequestInit[] = [];
    let url = '';
    const fetchFn: FetchFn = async (input, init) => {
      url = typeof input === 'string' ? input : '';
      calls.push(init ?? {});
      return json([
        {
          ecosystem: 'npm',
          name: 'express',
          funding_links: ['https://opencollective.com/express'],
        },
        { ecosystem: 'pypi', name: 'PyYAML' },
        { ecosystem: 'npm', name: 'not-requested' },
      ]);
    };
    const result = await lookupPackages(
      [
        { ecosystem: 'npm', name: 'express' },
        { ecosystem: 'pypi', name: 'pyyaml' },
        { ecosystem: 'cargo', name: 'missing' },
      ],
      lookupDeps(fetchFn),
    );
    expect(url).toBe(BULK_LOOKUP_URL);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers).toMatchObject({ 'User-Agent': USER_AGENT });
    expect(JSON.parse(calls[0]?.body as string)).toEqual({
      purls: ['pkg:npm/express', 'pkg:pypi/pyyaml', 'pkg:cargo/missing'],
    });
    expect([...result.keys()]).toEqual(['npm:express', 'pypi:pyyaml']);
    expect(result.get('npm:express')?.fundingLinks).toEqual(['https://opencollective.com/express']);
  });

  it('sends at most 100 purls per request', async () => {
    const requests: string[][] = [];
    const fixture = { recordedAt: NOW.toISOString(), packages: [] };
    const packages = Array.from({ length: 250 }, (_, i) => ({
      ecosystem: 'npm' as const,
      name: `pkg-${i}`,
    }));
    await lookupPackages(packages, lookupDeps(createFixtureFetch(fixture, requests)));
    expect(requests.map((r) => r.length).sort((a, b) => a - b)).toEqual([50, 100, 100]);
  });

  it('retries server errors and network failures with backoff', async () => {
    const sleeps: number[] = [];
    const fetchFn = scriptedFetch([
      json({}, 503),
      new TypeError('fetch failed'),
      json([{ ecosystem: 'npm', name: 'a' }]),
    ]);
    const result = await lookupPackages(
      [{ ecosystem: 'npm', name: 'a' }],
      lookupDeps(fetchFn, sleeps),
    );
    expect(result.has('npm:a')).toBe(true);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('gives up after four attempts', async () => {
    const fetchFn = scriptedFetch([json({}, 500), json({}, 502), json({}, 503), json({}, 504)]);
    await expect(
      lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(fetchFn)),
    ).rejects.toThrow('ecosyste.ms returned HTTP 504 after 4 attempts.');
  });

  it('waits for the rate limit reset when it is close', async () => {
    const sleeps: number[] = [];
    const reset = String(NOW.getTime() / 1000 + 30);
    const fetchFn = scriptedFetch([
      json({}, 429, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
      json([]),
    ]);
    await lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(fetchFn, sleeps));
    expect(sleeps).toEqual([30_000]);
  });

  it('honors Retry-After', async () => {
    const sleeps: number[] = [];
    const fetchFn = scriptedFetch([json({}, 429, { 'retry-after': '5' }), json([])]);
    await lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(fetchFn, sleeps));
    expect(sleeps).toEqual([5000]);
  });

  it('fails fast when the rate limit resets too far in the future', async () => {
    const reset = String(NOW.getTime() / 1000 + 1800);
    const fetchFn = scriptedFetch([
      json({}, 429, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
    ]);
    await expect(
      lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(fetchFn)),
    ).rejects.toThrow(
      'The ecosyste.ms rate limit was reached (5000 requests per hour without a key). It resets at 2026-10-18T12:30:00.000Z.',
    );
  });

  it('does not retry client errors', async () => {
    const fetchFn = scriptedFetch([json({ error: 'bad' }, 400)]);
    const promise = lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(fetchFn));
    await expect(promise).rejects.toThrow(ApiError);
    await expect(
      lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(scriptedFetch([json({}, 400)]))),
    ).rejects.toThrow('ecosyste.ms returned HTTP 400.');
  });

  it('rejects responses that are not arrays', async () => {
    const fetchFn = scriptedFetch([json({ packages: [] })]);
    await expect(
      lookupPackages([{ ecosystem: 'npm', name: 'a' }], lookupDeps(fetchFn)),
    ).rejects.toThrow('ecosyste.ms returned an unexpected response (expected a JSON array).');
  });

  it('works with the recorded demo fixture', async () => {
    const fixture = loadFixture('test/fixtures/api/demo.json');
    const result = await lookupPackages(
      [
        { ecosystem: 'cargo', name: 'serde' },
        { ecosystem: 'pypi', name: 'acme-internal-billing' },
      ],
      lookupDeps(createFixtureFetch(fixture)),
    );
    expect([...result.keys()]).toEqual(['cargo:serde']);
  });
});

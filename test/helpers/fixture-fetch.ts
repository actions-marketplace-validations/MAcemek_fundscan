import { readFileSync } from 'node:fs';
import { BULK_LOOKUP_URL, toPurl, type FetchFn } from '../../src/ecosystems.js';
import { normalizePypiName } from '../../src/parsers/pypi.js';
import type { Ecosystem } from '../../src/types.js';

/** Recorded ecosyste.ms package records, trimmed to the fields fundscan reads. */
export interface ApiFixture {
  recordedAt: string;
  packages: Record<string, unknown>[];
}

export function loadFixture(path: string): ApiFixture {
  return JSON.parse(readFileSync(path, 'utf8')) as ApiFixture;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keeps only the fields fundscan reads, so fixtures stay small and readable. */
export function trimRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const repo = isRecord(raw.repo_metadata) ? raw.repo_metadata : null;
  const stats = repo && isRecord(repo.commit_stats) ? repo.commit_stats : null;
  return {
    name: raw.name,
    ecosystem: raw.ecosystem,
    purl: raw.purl,
    registry: isRecord(raw.registry) ? { name: raw.registry.name } : null,
    status: raw.status ?? null,
    funding_links: raw.funding_links ?? [],
    latest_release_published_at: raw.latest_release_published_at ?? null,
    repository_url: raw.repository_url ?? null,
    registry_url: raw.registry_url ?? null,
    repo_metadata: repo
      ? {
          archived: repo.archived ?? false,
          pushed_at: repo.pushed_at ?? null,
          commit_stats: stats
            ? {
                total_commits: stats.total_commits,
                total_committers: stats.total_committers,
                dds: stats.dds,
              }
            : null,
        }
      : null,
  };
}

function recordPurl(record: Record<string, unknown>): string {
  const ecosystem = record.ecosystem as Ecosystem;
  const name = String(record.name);
  return toPurl(ecosystem, ecosystem === 'pypi' ? normalizePypiName(name) : name);
}

/**
 * A fetch that answers bulk lookups from a fixture, like the real API: unknown packages are
 * simply missing from the response. Every request's purls are appended to `requests`.
 */
export function createFixtureFetch(fixture: ApiFixture, requests: string[][] = []): FetchFn {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== BULK_LOOKUP_URL || init?.method !== 'POST') {
      return new Response('{"error":"not found"}', { status: 404 });
    }
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as {
      purls: string[];
    };
    requests.push(body.purls);
    const wanted = new Set(body.purls);
    const matches = fixture.packages.filter((record) => wanted.has(recordPurl(record)));
    return new Response(JSON.stringify(matches), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

import { dependencyKey } from './keys.js';
import { ApiError, errorMessage } from './errors.js';
import { isRecord } from './parsers/util.js';
import { ECOSYSTEMS, type CommitStats, type Ecosystem, type PackageInfo } from './types.js';
import { USER_AGENT } from './version.js';

export const API_BASE = 'https://packages.ecosyste.ms/api/v1';
export const BULK_LOOKUP_URL = `${API_BASE}/packages/bulk_lookup`;
/** The API accepts at most 100 purls per bulk lookup. */
export const BULK_LIMIT = 100;
export const CONCURRENCY = 4;
export const MAX_RETRIES = 3;
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_RATE_LIMIT_WAIT_MS = 60_000;

export const REGISTRY_NAMES: Record<Ecosystem, string> = {
  npm: 'npmjs.org',
  pypi: 'pypi.org',
  cargo: 'crates.io',
  go: 'proxy.golang.org',
};

export type FetchFn = typeof fetch;

export interface LookupDeps {
  fetch: FetchFn;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

/** Builds the package URL (purl) that the bulk lookup endpoint expects. */
export function toPurl(ecosystem: Ecosystem, name: string): string {
  switch (ecosystem) {
    case 'npm': {
      if (name.startsWith('@') && name.includes('/')) {
        const slash = name.indexOf('/');
        const scope = name.slice(1, slash);
        const rest = name.slice(slash + 1);
        return `pkg:npm/%40${encodeURIComponent(scope)}/${encodeURIComponent(rest)}`;
      }
      return `pkg:npm/${encodeURIComponent(name)}`;
    }
    case 'pypi':
      return `pkg:pypi/${encodeURIComponent(name)}`;
    case 'cargo':
      return `pkg:cargo/${encodeURIComponent(name)}`;
    case 'go':
      return `pkg:golang/${name.split('/').map(encodeURIComponent).join('/')}`;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function toCommitStats(value: unknown): CommitStats | null {
  if (!isRecord(value)) return null;
  const totalCommits = Number(value.total_commits);
  const totalCommitters = Number(value.total_committers);
  const dds = Number(value.dds);
  if (
    value.dds === null ||
    value.dds === undefined ||
    !Number.isFinite(totalCommits) ||
    !Number.isFinite(totalCommitters) ||
    !Number.isFinite(dds)
  ) {
    return null;
  }
  return { totalCommits, totalCommitters, dds };
}

/** Reads the fields fundscan uses from one ecosyste.ms package record. */
export function toPackageInfo(raw: Record<string, unknown>): PackageInfo {
  const repo = isRecord(raw.repo_metadata) ? raw.repo_metadata : null;
  const fundingLinks = Array.isArray(raw.funding_links)
    ? raw.funding_links.filter((link): link is string => typeof link === 'string')
    : [];
  return {
    status: stringOrNull(raw.status),
    fundingLinks,
    latestReleaseAt: stringOrNull(raw.latest_release_published_at),
    repositoryUrl: stringOrNull(raw.repository_url),
    registryUrl: stringOrNull(raw.registry_url),
    archived: repo?.archived === true,
    pushedAt: repo ? stringOrNull(repo.pushed_at) : null,
    commitStats: repo ? toCommitStats(repo.commit_stats) : null,
  };
}

function isEcosystem(value: unknown): value is Ecosystem {
  return typeof value === 'string' && (ECOSYSTEMS as readonly string[]).includes(value);
}

/** Returns the dependency key for a package record, or null if it is not from a supported registry. */
export function recordKey(raw: Record<string, unknown>): string | null {
  if (!isEcosystem(raw.ecosystem) || typeof raw.name !== 'string') return null;
  const registry = isRecord(raw.registry) ? raw.registry.name : undefined;
  if (registry !== undefined && registry !== REGISTRY_NAMES[raw.ecosystem]) return null;
  return dependencyKey(raw.ecosystem, raw.name);
}

function retryDelay(response: Response, attempt: number, nowMs: number): number | null {
  const backoff = 1000 * 2 ** attempt;
  if (response.status !== 429) return backoff;
  const retryAfter = Number(response.headers.get('retry-after'));
  if (response.headers.get('retry-after') !== null && Number.isFinite(retryAfter)) {
    const wait = retryAfter * 1000;
    return wait > MAX_RATE_LIMIT_WAIT_MS ? null : Math.max(wait, backoff);
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset)) {
    const wait = reset * 1000 - nowMs;
    return wait > MAX_RATE_LIMIT_WAIT_MS ? null : Math.max(wait, backoff);
  }
  return backoff;
}

function rateLimitMessage(response: Response): string {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const when =
    Number.isFinite(reset) && reset > 0
      ? ` It resets at ${new Date(reset * 1000).toISOString()}.`
      : '';
  return `The ecosyste.ms rate limit was reached (5000 requests per hour without a key).${when}`;
}

async function postChunk(purls: string[], deps: LookupDeps): Promise<unknown[]> {
  const body = JSON.stringify({ purls });
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await deps.fetch(BULK_LOOKUP_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await deps.sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new ApiError(`Could not reach ecosyste.ms: ${errorMessage(error)}`);
    }
    if (response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        throw new ApiError(`ecosyste.ms returned invalid JSON: ${errorMessage(error)}`);
      }
      if (!Array.isArray(data)) {
        throw new ApiError('ecosyste.ms returned an unexpected response (expected a JSON array).');
      }
      return data as unknown[];
    }
    if (response.status === 429 || response.status >= 500) {
      const wait = retryDelay(response, attempt, deps.now().getTime());
      if (wait === null) throw new ApiError(rateLimitMessage(response));
      if (attempt >= MAX_RETRIES) {
        throw new ApiError(
          response.status === 429
            ? rateLimitMessage(response)
            : `ecosyste.ms returned HTTP ${response.status} after ${MAX_RETRIES + 1} attempts.`,
        );
      }
      await deps.sleep(wait);
      continue;
    }
    throw new ApiError(`ecosyste.ms returned HTTP ${response.status}.`);
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Looks up packages with POST /packages/bulk_lookup, 100 purls per request.
 * Returns package info keyed by dependencyKey(); packages the API does not know are absent.
 */
export async function lookupPackages(
  packages: { ecosystem: Ecosystem; name: string }[],
  deps: LookupDeps,
): Promise<Map<string, PackageInfo>> {
  const wanted = new Set(packages.map((p) => dependencyKey(p.ecosystem, p.name)));
  const purls = [...new Set(packages.map((p) => toPurl(p.ecosystem, p.name)))];
  const chunks: string[][] = [];
  for (let i = 0; i < purls.length; i += BULK_LIMIT) chunks.push(purls.slice(i, i + BULK_LIMIT));
  const responses = await mapLimit(chunks, CONCURRENCY, (chunk) => postChunk(chunk, deps));
  const result = new Map<string, PackageInfo>();
  for (const records of responses) {
    for (const raw of records) {
      if (!isRecord(raw)) continue;
      const key = recordKey(raw);
      if (key === null || !wanted.has(key) || result.has(key)) continue;
      result.set(key, toPackageInfo(raw));
    }
  }
  return result;
}

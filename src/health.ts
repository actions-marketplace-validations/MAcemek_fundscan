import type { Flag, PackageInfo } from './types.js';

/** A dependency is stale when neither a release nor a repository push happened in this many days. */
export const STALE_DAYS = 730;
/** A dependency is concentrated when the top committer wrote at least 90% of the commits (dds <= 0.1). */
export const CONCENTRATION_MAX_DDS = 0.1;
/** Repositories with fewer commits than this are too small to judge concentration. */
export const CONCENTRATION_MIN_COMMITS = 20;

export const DEPRECATED_STATUSES = new Set([
  'deprecated',
  'removed',
  'unpublished',
  'yanked',
  'abandoned',
  'unmaintained',
]);

const DAY_MS = 86_400_000;

function parseDate(value: string | null): Date | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Returns the health flags for one dependency. `info` is undefined when ecosyste.ms does not know it. */
export function evaluateHealth(info: PackageInfo | undefined, now: Date): Flag[] {
  if (!info) return [{ id: 'unknown', detail: 'not found on ecosyste.ms' }];
  const flags: Flag[] = [];
  if (info.status !== null && DEPRECATED_STATUSES.has(info.status.toLowerCase())) {
    flags.push({ id: 'deprecated', detail: `status: ${info.status}` });
  }
  if (info.archived) {
    flags.push({ id: 'archived', detail: 'repository archived' });
  }
  const dates = [parseDate(info.latestReleaseAt), parseDate(info.pushedAt)].filter(
    (date): date is Date => date !== null,
  );
  if (dates.length > 0) {
    const last = new Date(Math.max(...dates.map((date) => date.getTime())));
    if ((now.getTime() - last.getTime()) / DAY_MS > STALE_DAYS) {
      flags.push({
        id: 'stale',
        detail: `no release or push since ${last.toISOString().slice(0, 10)}`,
      });
    }
  }
  const stats = info.commitStats;
  if (
    stats !== null &&
    stats.totalCommits >= CONCENTRATION_MIN_COMMITS &&
    stats.dds <= CONCENTRATION_MAX_DDS
  ) {
    const share = Math.floor((1 - stats.dds) * 100 + 1e-9);
    flags.push({
      id: 'concentrated',
      detail: `top committer wrote ${share}% of ${stats.totalCommits} commits`,
    });
  }
  return flags;
}

import { compareStrings } from './keys.js';
import { PLATFORM_IDS, PLATFORM_NAMES, type FundingDestination, type PlatformId } from './types.js';

export interface ClassifiedLink {
  key: string;
  platform: PlatformId;
  url: string;
}

const ACCOUNT_PLATFORMS: Record<string, { platform: PlatformId; base: string }> = {
  'opencollective.com': { platform: 'opencollective', base: 'https://opencollective.com/' },
  'patreon.com': { platform: 'patreon', base: 'https://www.patreon.com/' },
  'ko-fi.com': { platform: 'ko-fi', base: 'https://ko-fi.com/' },
  'liberapay.com': { platform: 'liberapay', base: 'https://liberapay.com/' },
  'polar.sh': { platform: 'polar', base: 'https://polar.sh/' },
  'buymeacoffee.com': { platform: 'buymeacoffee', base: 'https://buymeacoffee.com/' },
};

function parseHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
}

function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter((segment) => segment !== '');
}

function account(platform: PlatformId, name: string, url: string): ClassifiedLink {
  return { key: `${platform}:${name.toLowerCase()}`, platform, url };
}

/** Maps a funding URL to a platform and a stable key, so links to the same account group together. */
export function classifyFundingUrl(raw: string): ClassifiedLink | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const host = bareHost(url);
  const segments = pathSegments(url);
  const first = segments[0];
  if (host === 'github.com' && first?.toLowerCase() === 'sponsors' && segments[1]) {
    return account('github', segments[1], `https://github.com/sponsors/${segments[1]}`);
  }
  if (host === 'tidelift.com') {
    return { key: 'tidelift', platform: 'tidelift', url: 'https://tidelift.com' };
  }
  if (host === 'thanks.dev' && segments.length > 0) {
    const path = segments.join('/');
    return account('thanks-dev', path, `https://thanks.dev/${path}`);
  }
  const known = ACCOUNT_PLATFORMS[host];
  if (known && first) {
    const name =
      host === 'patreon.com' && (first === 'c' || first === 'join') ? segments[1] : first;
    if (name) return account(known.platform, name, `${known.base}${name}`);
  }
  const path = url.pathname.replace(/\/+$/, '');
  return {
    key: `custom:${host}${path.toLowerCase()}${url.search}`,
    platform: 'custom',
    url: `${url.protocol}//${url.host}${path}${url.search}`,
  };
}

/** "https://github.com/owner/repo?sponsor=1" only points at the repository's FUNDING.yml. */
export function isRepositorySponsorLink(raw: string): boolean {
  const url = parseHttpUrl(raw);
  if (!url) return false;
  const segments = pathSegments(url);
  return (
    bareHost(url) === 'github.com' &&
    segments.length === 2 &&
    segments[0]?.toLowerCase() !== 'sponsors' &&
    url.searchParams.has('sponsor')
  );
}

/**
 * Classifies a package's funding links and removes duplicates. Repository sponsor links are
 * dropped when the package lists any other link, because they lead to the same accounts.
 */
export function classifyPackageFunding(links: string[]): ClassifiedLink[] {
  const others = links.filter((link) => !isRepositorySponsorLink(link));
  const usable = others.length > 0 ? others : links;
  const seen = new Set<string>();
  const result: ClassifiedLink[] = [];
  for (const link of usable) {
    const classified = classifyFundingUrl(link);
    if (!classified || seen.has(classified.key)) continue;
    seen.add(classified.key);
    result.push(classified);
  }
  return result;
}

/** Groups destinations and ranks them by how many dependencies they cover. */
export function buildDestinations(
  entries: { id: string; links: ClassifiedLink[] }[],
): FundingDestination[] {
  const byKey = new Map<string, { link: ClassifiedLink; dependencies: string[] }>();
  for (const entry of entries) {
    for (const link of entry.links) {
      const existing = byKey.get(link.key);
      if (existing) {
        if (!existing.dependencies.includes(entry.id)) existing.dependencies.push(entry.id);
      } else {
        byKey.set(link.key, { link, dependencies: [entry.id] });
      }
    }
  }
  const sorted = [...byKey.values()].sort(
    (a, b) =>
      b.dependencies.length - a.dependencies.length ||
      PLATFORM_IDS.indexOf(a.link.platform) - PLATFORM_IDS.indexOf(b.link.platform) ||
      compareStrings(a.link.key, b.link.key),
  );
  return sorted.map((item, index) => ({
    rank: index + 1,
    key: item.link.key,
    platform: item.link.platform,
    platformName: PLATFORM_NAMES[item.link.platform],
    url: item.link.url,
    dependencyCount: item.dependencies.length,
    dependencies: item.dependencies,
  }));
}

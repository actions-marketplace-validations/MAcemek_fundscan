import { describe, expect, it } from 'vitest';
import {
  buildDestinations,
  classifyFundingUrl,
  classifyPackageFunding,
  isRepositorySponsorLink,
} from '../src/funding.js';

describe('classifyFundingUrl', () => {
  it.each([
    [
      'https://github.com/sponsors/dtolnay',
      'github',
      'github:dtolnay',
      'https://github.com/sponsors/dtolnay',
    ],
    [
      'https://www.github.com/sponsors/Qix-/',
      'github',
      'github:qix-',
      'https://github.com/sponsors/Qix-',
    ],
    [
      'https://opencollective.com/express',
      'opencollective',
      'opencollective:express',
      'https://opencollective.com/express',
    ],
    [
      'https://www.patreon.com/zloirock',
      'patreon',
      'patreon:zloirock',
      'https://www.patreon.com/zloirock',
    ],
    [
      'https://patreon.com/c/someone',
      'patreon',
      'patreon:someone',
      'https://www.patreon.com/someone',
    ],
    ['https://ko-fi.com/someone', 'ko-fi', 'ko-fi:someone', 'https://ko-fi.com/someone'],
    [
      'https://liberapay.com/someone/donate',
      'liberapay',
      'liberapay:someone',
      'https://liberapay.com/someone',
    ],
    [
      'https://tidelift.com/funding/github/npm/yaml',
      'tidelift',
      'tidelift',
      'https://tidelift.com',
    ],
    [
      'https://thanks.dev/u/gh/pallets',
      'thanks-dev',
      'thanks-dev:u/gh/pallets',
      'https://thanks.dev/u/gh/pallets',
    ],
    ['https://polar.sh/someone', 'polar', 'polar:someone', 'https://polar.sh/someone'],
    [
      'https://www.buymeacoffee.com/someone',
      'buymeacoffee',
      'buymeacoffee:someone',
      'https://buymeacoffee.com/someone',
    ],
    [
      'https://palletsprojects.com/donate/',
      'custom',
      'custom:palletsprojects.com/donate',
      'https://palletsprojects.com/donate',
    ],
    [
      'https://www.python.org/psf/sponsorship/',
      'custom',
      'custom:python.org/psf/sponsorship',
      'https://www.python.org/psf/sponsorship',
    ],
    [
      'https://opencollective.com/',
      'custom',
      'custom:opencollective.com',
      'https://opencollective.com',
    ],
  ])('classifies %s', (input, platform, key, url) => {
    expect(classifyFundingUrl(input)).toEqual({ platform, key, url });
  });

  it('rejects anything that is not an http(s) URL', () => {
    expect(classifyFundingUrl('not a url')).toBeNull();
    expect(classifyFundingUrl('mailto:someone@example.com')).toBeNull();
  });
});

describe('isRepositorySponsorLink', () => {
  it('recognises the repository sponsor button link', () => {
    expect(isRepositorySponsorLink('https://github.com/chalk/chalk?sponsor=1')).toBe(true);
    expect(isRepositorySponsorLink('https://github.com/sponsors/chalk')).toBe(false);
    expect(isRepositorySponsorLink('https://github.com/chalk/chalk')).toBe(false);
  });
});

describe('classifyPackageFunding', () => {
  it('drops repository sponsor links when other links exist, and duplicates', () => {
    expect(
      classifyPackageFunding([
        'https://github.com/chalk/chalk?sponsor=1',
        'https://github.com/sponsors/sindresorhus',
        'https://github.com/sponsors/Sindresorhus/',
        'nonsense',
      ]).map((link) => link.key),
    ).toEqual(['github:sindresorhus']);
  });

  it('keeps a repository sponsor link when it is the only one', () => {
    expect(
      classifyPackageFunding(['https://github.com/chalk/chalk?sponsor=1']).map((l) => l.url),
    ).toEqual(['https://github.com/chalk/chalk?sponsor=1']);
  });
});

describe('buildDestinations', () => {
  it('ranks by coverage, then platform order, then key', () => {
    const gh = (name: string) => classifyFundingUrl(`https://github.com/sponsors/${name}`)!;
    const oc = classifyFundingUrl('https://opencollective.com/x')!;
    const custom = classifyFundingUrl('https://example.com/donate')!;
    const destinations = buildDestinations([
      { id: 'npm:a', links: [custom, gh('zed')] },
      { id: 'npm:b', links: [oc, gh('amy')] },
      { id: 'npm:c', links: [gh('zed')] },
      { id: 'npm:d', links: [] },
    ]);
    expect(destinations.map((d) => [d.rank, d.key, d.dependencyCount, d.dependencies])).toEqual([
      [1, 'github:zed', 2, ['npm:a', 'npm:c']],
      [2, 'github:amy', 1, ['npm:b']],
      [3, 'opencollective:x', 1, ['npm:b']],
      [4, 'custom:example.com/donate', 1, ['npm:a']],
    ]);
    expect(destinations[0]?.platformName).toBe('GitHub Sponsors');
  });
});

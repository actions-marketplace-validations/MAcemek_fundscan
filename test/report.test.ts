import { describe, expect, it } from 'vitest';
import { formatJson, formatReport } from '../src/format/index.js';
import { escapeMarkdown, markdownLink } from '../src/format/markdown.js';
import { renderTable } from '../src/format/text.js';
import { buildReport, failOnMessage, matchFailOn } from '../src/report.js';
import type { CollectResult, PackageInfo, Report } from '../src/types.js';

const NOW = new Date('2026-10-18T00:00:00Z');

function info(overrides: Partial<PackageInfo>): PackageInfo {
  return {
    status: null,
    fundingLinks: [],
    latestReleaseAt: '2026-09-01T00:00:00Z',
    repositoryUrl: null,
    registryUrl: null,
    archived: false,
    pushedAt: '2026-10-01T00:00:00Z',
    commitStats: null,
    ...overrides,
  };
}

const collected: CollectResult = {
  files: ['Cargo.toml', 'package.json'],
  dependencies: [
    { ecosystem: 'npm', name: 'left-pad', direct: true, dev: false, sources: ['package.json'] },
    { ecosystem: 'npm', name: 'lib_a', direct: true, dev: false, sources: ['package.json'] },
    { ecosystem: 'npm', name: 'private-pkg', direct: true, dev: false, sources: ['package.json'] },
    { ecosystem: 'cargo', name: 'serde', direct: true, dev: false, sources: ['Cargo.toml'] },
  ],
  warnings: ['package.json: skipped "x" (not from the npm registry: a/b)'],
};

const packages = new Map<string, PackageInfo>([
  ['npm:left-pad', info({ status: 'deprecated', archived: true })],
  [
    'npm:lib_a',
    info({
      fundingLinks: ['https://github.com/sponsors/dtolnay', 'https://opencollective.com/a'],
    }),
  ],
  ['cargo:serde', info({ fundingLinks: ['https://github.com/sponsors/dtolnay'] })],
]);

function sampleReport(budget: { totalCents: number; currency: string } | null): Report {
  return buildReport({
    root: 'demo',
    options: { all: false, dev: false, recursive: false },
    collected,
    packages,
    budget,
    now: NOW,
  });
}

describe('buildReport', () => {
  it('summarises funding and health', () => {
    const report = sampleReport({ totalCents: 1_000, currency: 'EUR' });
    expect(report.summary).toEqual({
      dependencies: 4,
      byEcosystem: { npm: 3, pypi: 0, cargo: 1, go: 0 },
      withFunding: 2,
      withoutFunding: 2,
      flagged: 2,
      byFlag: { deprecated: 1, archived: 1, stale: 0, concentrated: 0, unknown: 1 },
      destinations: 2,
    });
    expect(report.destinations.map((d) => [d.key, d.dependencies])).toEqual([
      ['github:dtolnay', ['npm:lib_a', 'cargo:serde']],
      ['opencollective:a', ['npm:lib_a']],
    ]);
    expect(report.budget).toEqual({
      currency: 'EUR',
      totalCents: 1_000,
      parts: [
        { key: 'github:dtolnay', url: 'https://github.com/sponsors/dtolnay', amountCents: 750 },
        { key: 'opencollective:a', url: 'https://opencollective.com/a', amountCents: 250 },
      ],
    });
    expect(report.dependencies.find((d) => d.name === 'private-pkg')?.found).toBe(false);
    expect(report.generatedAt).toBe('2026-10-18T00:00:00.000Z');
  });

  it('matches fail-on flags', () => {
    const report = sampleReport(null);
    expect(matchFailOn(report, []).length).toBe(0);
    expect(matchFailOn(report, ['stale']).length).toBe(0);
    expect(matchFailOn(report, ['archived', 'unknown']).map((d) => d.name)).toEqual([
      'left-pad',
      'private-pkg',
    ]);
    expect(failOnMessage(1, ['unknown'])).toBe('1 dependency matched fail-on (unknown).');
    expect(failOnMessage(2, ['archived', 'unknown'])).toBe(
      '2 dependencies matched fail-on (archived, unknown).',
    );
  });
});

describe('renderTable', () => {
  it('aligns columns and trims trailing spaces', () => {
    expect(
      renderTable(
        ['A', 'Long'],
        [
          ['xyz', '1'],
          ['b', ''],
        ],
        ['left', 'right'],
      ),
    ).toEqual(['  A    Long', '  xyz     1', '  b']);
  });
});

describe('formatText', () => {
  it('renders the full report', () => {
    expect(
      formatReport(sampleReport({ totalCents: 1_000, currency: 'EUR' }), 'text', { color: false }),
    ).toBe(`fundscan 0.1.0
Scanned demo: Cargo.toml, package.json
4 dependencies: npm 3, Cargo 1

Who to fund
  2 of 4 dependencies list funding, through 2 destinations.

  #  Deps  Platform         Destination                          Covers
  1     2  GitHub Sponsors  https://github.com/sponsors/dtolnay  lib_a, serde
  2     1  Open Collective  https://opencollective.com/a         lib_a

  No funding listed: left-pad

Suggested split of 10.00 EUR
  Amount  Destination
    7.50  https://github.com/sponsors/dtolnay
    2.50  https://opencollective.com/a

Dependencies at risk
  2 of 4 dependencies are flagged.

  Package      Ecosystem  Flags                 Details
  left-pad     npm        deprecated, archived  status: deprecated; repository archived
  private-pkg  npm        unknown               not found on ecosyste.ms

Warnings
  - package.json: skipped "x" (not from the npm registry: a/b)

Data from packages.ecosyste.ms
`);
  });

  it('uses ANSI colors only when asked', () => {
    const report = sampleReport(null);
    expect(formatReport(report, 'text', { color: false })).not.toContain('\u001b[');
    const colored = formatReport(report, 'text', { color: true });
    expect(colored).toContain('\u001b[1mWho to fund\u001b[0m');
    expect(colored).toContain('\u001b[33munknown');
  });

  it('handles a project without dependencies', () => {
    const empty = buildReport({
      root: '.',
      options: { all: false, dev: false, recursive: false },
      collected: { files: ['package.json'], dependencies: [], warnings: [] },
      packages: new Map(),
      budget: { totalCents: 500, currency: 'USD' },
      now: NOW,
    });
    expect(formatReport(empty, 'text', { color: false })).toBe(`fundscan 0.1.0
Scanned .: package.json
0 dependencies

Who to fund
  No dependencies to look up.

Suggested split of 5.00 USD
  No funding destinations, so there is nothing to split.

Dependencies at risk
  No dependencies are flagged.

Data from packages.ecosyste.ms
`);
  });
});

describe('formatMarkdown', () => {
  it('renders tables, links and escapes', () => {
    expect(
      formatReport(sampleReport({ totalCents: 1_000, currency: 'EUR' }), 'markdown', {
        color: true,
      }),
    ).toBe(`## fundscan report

Scanned \`demo\`: \`Cargo.toml\`, \`package.json\`.
4 dependencies: npm 3, Cargo 1.

### Who to fund

2 of 4 dependencies list funding, through 2 destinations.

| # | Destination | Platform | Deps | Covers |
| --: | --- | --- | --: | --- |
| 1 | [github.com/sponsors/dtolnay](https://github.com/sponsors/dtolnay) | GitHub Sponsors | 2 | lib\\_a, serde |
| 2 | [opencollective.com/a](https://opencollective.com/a) | Open Collective | 1 | lib\\_a |

No funding listed: left-pad.

### Suggested split of 10.00 EUR

| Destination | Amount |
| --- | --: |
| [github.com/sponsors/dtolnay](https://github.com/sponsors/dtolnay) | 7.50 EUR |
| [opencollective.com/a](https://opencollective.com/a) | 2.50 EUR |

### Dependencies at risk

2 of 4 dependencies are flagged.

| Package | Ecosystem | Flags | Details |
| --- | --- | --- | --- |
| left-pad | npm | deprecated, archived | status: deprecated; repository archived |
| private-pkg | npm | unknown | not found on ecosyste.ms |

### Warnings

- package.json: skipped "x" (not from the npm registry: a/b)

Data from [ecosyste.ms](https://ecosyste.ms). Report by [fundscan](https://github.com/MAcemek/fundscan) 0.1.0.
`);
  });

  it('escapes Markdown characters and link targets', () => {
    expect(escapeMarkdown('a|b *c* <d> [e]')).toBe('a\\|b \\*c\\* \\<d\\> \\[e\\]');
    expect(markdownLink('https://example.com/a (b)')).toBe(
      '[example.com/a (b)](https://example.com/a%20%28b%29)',
    );
  });
});

describe('formatJson', () => {
  it('serialises the report with schemaVersion 1', () => {
    const parsed = JSON.parse(formatJson(sampleReport(null))) as Report;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.tool).toEqual({ name: 'fundscan', version: '0.1.0' });
    expect(parsed.budget).toBeNull();
    expect(parsed.dependencies).toHaveLength(4);
  });
});

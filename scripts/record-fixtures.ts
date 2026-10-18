/**
 * Refreshes test/fixtures/api/demo.json from the live ecosyste.ms API.
 *
 *   npm run record-fixtures
 *
 * This needs network access. Afterwards, run `npm run demo` and paste its output into the
 * example in README.md (a test checks that they match).
 */
import { writeFileSync } from 'node:fs';
import { collectDependencies } from '../src/collect.js';
import { BULK_LOOKUP_URL, toPurl } from '../src/ecosystems.js';
import { compareStrings } from '../src/keys.js';
import { USER_AGENT } from '../src/version.js';
import { trimRecord, type ApiFixture } from '../test/helpers/fixture-fetch.js';

const OUTPUT = 'test/fixtures/api/demo.json';

const collected = await collectDependencies('examples/demo', 'examples/demo', {
  all: true,
  dev: true,
  recursive: false,
});
const purls = collected.dependencies.map((d) => toPurl(d.ecosystem, d.name));
const response = await fetch(BULK_LOOKUP_URL, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  },
  body: JSON.stringify({ purls }),
});
if (!response.ok) {
  throw new Error(`ecosyste.ms returned HTTP ${response.status}`);
}
const records = (await response.json()) as Record<string, unknown>[];
const packages = records
  .map(trimRecord)
  .sort(
    (a, b) =>
      compareStrings(String(a.ecosystem), String(b.ecosystem)) ||
      compareStrings(String(a.name), String(b.name)),
  );
const fixture: ApiFixture = { recordedAt: new Date().toISOString(), packages };
writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${packages.length} of ${purls.length} packages to ${OUTPUT}`);

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readActionInputs, runAction, type ActionDeps } from '../src/action-main.js';
import type { FetchFn } from '../src/ecosystems.js';
import type { Report } from '../src/types.js';
import { createFixtureFetch, loadFixture } from './helpers/fixture-fetch.js';

const fixture = loadFixture('test/fixtures/api/demo.json');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(inputs: Record<string, string>, fetchFn?: FetchFn) {
  const tempDir = mkdtempSync(join(tmpdir(), 'fundscan-action-'));
  tempDirs.push(tempDir);
  const result = {
    logs: [] as string[],
    warnings: [] as string[],
    summaries: [] as string[],
    outputs: {} as Record<string, string>,
    failures: [] as string[],
  };
  const deps: ActionDeps = {
    getInput: (name) => inputs[name] ?? '',
    fetch: fetchFn ?? createFixtureFetch(fixture),
    sleep: async () => undefined,
    now: () => new Date(fixture.recordedAt),
    cwd: process.cwd(),
    tempDir,
    info: (message) => result.logs.push(message),
    warning: (message) => result.warnings.push(message),
    writeSummary: async (markdown) => {
      result.summaries.push(markdown);
    },
    setOutput: (name, value) => {
      result.outputs[name] = value;
    },
    setFailed: (message) => result.failures.push(message),
  };
  return { deps, result, tempDir };
}

describe('readActionInputs', () => {
  it('applies defaults for empty inputs', () => {
    expect(readActionInputs(() => '')).toEqual({
      path: '.',
      options: { all: false, dev: false, recursive: false },
      budgetCents: null,
      currency: 'USD',
      failOn: [],
    });
  });

  it('rejects invalid booleans', () => {
    expect(() => readActionInputs((name) => (name === 'dev' ? 'yes' : ''))).toThrow(
      'Input "dev" must be true or false, got "yes".',
    );
  });
});

describe('runAction', () => {
  it('logs the report, writes the summary and JSON, and sets outputs', async () => {
    const { deps, result, tempDir } = setup({ path: 'examples/demo', budget: '100', dev: 'true' });
    await runAction(deps);
    expect(result.failures).toEqual([]);
    expect(result.logs[0]).toMatch(/^fundscan 0\.1\.0\nScanned examples\/demo: /);
    expect(result.summaries[0]).toMatch(/^## fundscan report\n/);
    expect(result.warnings).toEqual([
      'requirements.txt: skipped "-e ./tools/local-lib" (editable installs are not looked up)',
    ]);
    const reportPath = join(tempDir, 'fundscan-report.json');
    expect(result.outputs).toEqual({
      'dependency-count': '21',
      'flagged-count': '9',
      'destination-count': '22',
      'funding-destinations': expect.stringMatching(/^\["https:\/\/tidelift\.com",/),
      'report-json': reportPath,
    });
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
    expect(report.summary.dependencies).toBe(21);
    expect(report.budget?.totalCents).toBe(10_000);
  });

  it('fails the run when fail-on matches', async () => {
    const { deps, result } = setup({ path: 'examples/demo', 'fail-on': 'archived' });
    await runAction(deps);
    expect(result.failures).toEqual(['3 dependencies matched fail-on (archived).']);
    expect(result.outputs['flagged-count']).toBe('9');
  });

  it('fails the run for invalid inputs and API errors', async () => {
    const invalid = setup({ path: 'examples/demo', 'fail-on': 'nope' });
    await runAction(invalid.deps);
    expect(invalid.result.failures).toEqual([
      'Unknown fail-on value "nope". Use deprecated, archived, stale, concentrated, unknown.',
    ]);
    const api = setup({ path: 'examples/demo' }, async () => new Response('', { status: 404 }));
    await runAction(api.deps);
    expect(api.result.failures).toEqual(['ecosyste.ms returned HTTP 404.']);
    expect(api.result.outputs).toEqual({});
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HELP_TEXT } from '../src/args.js';
import { runCli, shouldUseColor, type CliDeps } from '../src/cli-main.js';
import type { FetchFn } from '../src/ecosystems.js';
import { VERSION } from '../src/version.js';
import { createFixtureFetch, loadFixture } from './helpers/fixture-fetch.js';

const fixture = loadFixture('test/fixtures/api/demo.json');

class Capture {
  text = '';
  isTTY?: boolean;
  constructor(isTTY?: boolean) {
    this.isTTY = isTTY;
  }
  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

function setup(overrides: Partial<CliDeps> = {}) {
  const stdout = new Capture();
  const stderr = new Capture();
  const deps: CliDeps = {
    fetch: createFixtureFetch(fixture),
    sleep: async () => undefined,
    now: () => new Date(fixture.recordedAt),
    cwd: process.cwd(),
    env: {},
    stdout,
    stderr,
    ...overrides,
  };
  return { deps, stdout, stderr };
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('runCli', () => {
  it('prints help and the version', async () => {
    const help = setup();
    expect(await runCli(['--help'], help.deps)).toBe(0);
    expect(help.stdout.text).toBe(HELP_TEXT);
    const version = setup();
    expect(await runCli(['--version'], version.deps)).toBe(0);
    expect(version.stdout.text).toBe(`${VERSION}\n`);
  });

  it('keeps VERSION in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it('prints a text report and exits 0', async () => {
    const { deps, stdout, stderr } = setup();
    expect(await runCli(['examples/demo'], deps)).toBe(0);
    expect(stdout.text).toContain(
      'Scanned examples/demo: Cargo.toml, go.mod, package.json, requirements.txt',
    );
    expect(stdout.text).toContain('20 dependencies: npm 6, PyPI 6, Cargo 5, Go 3');
    expect(stdout.text).not.toContain('Suggested split');
    expect(stderr.text).toBe('');
  });

  it('includes transitive and dev dependencies when asked', async () => {
    const { deps, stdout } = setup();
    expect(await runCli(['examples/demo', '--all', '--dev', '--format', 'json'], deps)).toBe(0);
    const report = JSON.parse(stdout.text) as { summary: { dependencies: number } };
    expect(report.summary.dependencies).toBe(24);
  });

  it('exits 1 when fail-on matches', async () => {
    const { deps, stderr } = setup();
    expect(await runCli(['examples/demo', '--fail-on', 'deprecated,unknown'], deps)).toBe(1);
    expect(stderr.text).toBe('fundscan: 3 dependencies matched fail-on (deprecated, unknown).\n');
  });

  it('exits 0 when fail-on does not match', async () => {
    const { deps, stderr } = setup();
    expect(await runCli(['test/fixtures/projects/monorepo', '--fail-on', 'stale'], deps)).toBe(0);
    expect(stderr.text).toBe('');
  });

  it('writes the report to a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fundscan-'));
    tempDirs.push(dir);
    const file = join(dir, 'report.md');
    const { deps, stdout, stderr } = setup();
    expect(await runCli(['examples/demo', '--format', 'markdown', '-o', file], deps)).toBe(0);
    expect(stdout.text).toBe('');
    expect(stderr.text).toBe(`Report written to ${file}\n`);
    expect(readFileSync(file, 'utf8')).toMatch(/^## fundscan report\n/);
  });

  it('exits 2 for usage errors', async () => {
    const { deps, stderr } = setup();
    expect(await runCli(['--format', 'xml'], deps)).toBe(2);
    expect(stderr.text).toBe(
      'fundscan: Unknown format "xml". Use text, markdown or json.\nRun "fundscan --help" for usage.\n',
    );
  });

  it('exits 2 when the path has no dependency files or does not exist', async () => {
    const empty = setup();
    expect(await runCli(['test/fixtures/projects/empty'], empty.deps)).toBe(2);
    expect(empty.stderr.text).toMatch(
      /^fundscan: No supported dependency files found in test\/fixtures\/projects\/empty\./,
    );
    const missing = setup();
    expect(await runCli(['does/not/exist'], missing.deps)).toBe(2);
    expect(missing.stderr.text).toBe(
      'fundscan: Path not found or not a directory: does/not/exist\n',
    );
  });

  it('exits 2 for unparsable files', async () => {
    const { deps, stderr } = setup();
    expect(await runCli(['test/fixtures/projects/broken'], deps)).toBe(2);
    expect(stderr.text).toMatch(/^fundscan: Could not parse package\.json: /);
  });

  it('exits 3 when the API fails', async () => {
    const failing: FetchFn = async () => new Response('{}', { status: 503 });
    const { deps, stdout, stderr } = setup({ fetch: failing });
    expect(await runCli(['examples/demo'], deps)).toBe(3);
    expect(stdout.text).toBe('');
    expect(stderr.text).toBe('fundscan: ecosyste.ms returned HTTP 503 after 4 attempts.\n');
  });

  it('does not call the API when there are no dependencies', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fundscan-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'package.json'), '{ "name": "no-deps" }\n');
    const requests: string[][] = [];
    const { deps, stdout } = setup({ fetch: createFixtureFetch(fixture, requests) });
    expect(await runCli([dir, '--format', 'json'], deps)).toBe(0);
    expect(requests).toEqual([]);
    expect(JSON.parse(stdout.text)).toMatchObject({ summary: { dependencies: 0 } });
  });
});

describe('shouldUseColor', () => {
  const options = {
    path: '.',
    format: 'text' as const,
    all: false,
    dev: false,
    recursive: false,
    budgetCents: null,
    currency: 'USD',
    failOn: [],
    output: null,
    noColor: false,
  };

  it('colors only text output on a TTY', () => {
    const tty = setup({ stdout: new Capture(true) }).deps;
    expect(shouldUseColor(options, tty)).toBe(true);
    expect(shouldUseColor({ ...options, noColor: true }, tty)).toBe(false);
    expect(shouldUseColor({ ...options, format: 'json' }, tty)).toBe(false);
    expect(shouldUseColor({ ...options, output: 'x.txt' }, tty)).toBe(false);
    expect(shouldUseColor(options, { ...tty, env: { NO_COLOR: '1' } })).toBe(false);
    expect(shouldUseColor(options, { ...tty, env: { TERM: 'dumb' } })).toBe(false);
    expect(shouldUseColor(options, setup().deps)).toBe(false);
  });
});

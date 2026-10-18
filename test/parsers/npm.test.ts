import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UsageError } from '../../src/errors.js';
import { parsePackageJson, parsePackageLock, resolveNpmSpec } from '../../src/parsers/npm.js';

const read = (path: string): string => readFileSync(`test/fixtures/projects/${path}`, 'utf8');

describe('resolveNpmSpec', () => {
  it('treats version ranges and tags as registry dependencies', () => {
    expect(resolveNpmSpec('express', '^5.1.0')).toEqual({ kind: 'registry', name: 'express' });
    expect(resolveNpmSpec('express', 'latest')).toEqual({ kind: 'registry', name: 'express' });
    expect(resolveNpmSpec('express', '')).toEqual({ kind: 'registry', name: 'express' });
  });

  it('resolves npm: aliases to the real package name', () => {
    expect(resolveNpmSpec('my-alias', 'npm:chalk@^5.0.0')).toEqual({
      kind: 'registry',
      name: 'chalk',
    });
    expect(resolveNpmSpec('types', 'npm:@types/node@24')).toEqual({
      kind: 'registry',
      name: '@types/node',
    });
    expect(resolveNpmSpec('x', 'npm:left-pad')).toEqual({ kind: 'registry', name: 'left-pad' });
  });

  it('recognises local and remote specs', () => {
    expect(resolveNpmSpec('a', 'file:../a').kind).toBe('local');
    expect(resolveNpmSpec('a', 'workspace:*').kind).toBe('local');
    expect(resolveNpmSpec('a', 'link:../a').kind).toBe('local');
    expect(resolveNpmSpec('a', 'git+https://github.com/x/a.git').kind).toBe('remote');
    expect(resolveNpmSpec('a', 'github:x/a').kind).toBe('remote');
    expect(resolveNpmSpec('a', 'x/a#main').kind).toBe('remote');
    expect(resolveNpmSpec('a', 'https://example.com/a.tgz').kind).toBe('remote');
  });
});

describe('parsePackageJson', () => {
  it('reads dependencies, optionalDependencies and devDependencies', () => {
    const result = parsePackageJson(read('npm/package.json'), 'package.json');
    expect(result.dependencies).toEqual([
      { ecosystem: 'npm', name: 'express', direct: true, dev: false },
      { ecosystem: 'npm', name: '@types/node', direct: true, dev: false },
      { ecosystem: 'npm', name: 'chalk', direct: true, dev: false },
      { ecosystem: 'npm', name: 'fsevents', direct: true, dev: false },
      { ecosystem: 'npm', name: 'vitest', direct: true, dev: true },
      { ecosystem: 'npm', name: 'express', direct: true, dev: true },
    ]);
    expect(result.warnings).toEqual([
      'package.json: skipped "from-git" (not from the npm registry: git+https://github.com/example/from-git.git)',
      'package.json: skipped "shorthand" (not from the npm registry: example/shorthand#main)',
      'package.json: skipped "tarball" (not from the npm registry: https://example.com/pkg.tgz)',
    ]);
  });

  it('throws a UsageError for invalid JSON', () => {
    expect(() => parsePackageJson(read('broken/package.json'), 'package.json')).toThrow(UsageError);
    expect(() => parsePackageJson('[]', 'package.json')).toThrow(
      'Could not parse package.json: expected a JSON object',
    );
  });

  it('accepts a byte order mark', () => {
    const result = parsePackageJson(
      `${String.fromCharCode(0xfeff)}{"dependencies":{"ms":"2"}}`,
      'package.json',
    );
    expect(result.dependencies).toHaveLength(1);
  });
});

describe('parsePackageLock', () => {
  it('reads every registry package from a v3 lockfile', () => {
    const result = parsePackageLock(read('npm/package-lock.json'), 'package-lock.json');
    expect(result.warnings).toEqual([]);
    expect(result.dependencies).toEqual([
      { ecosystem: 'npm', name: 'express', direct: false, dev: false },
      { ecosystem: 'npm', name: '@types/node', direct: false, dev: false },
      { ecosystem: 'npm', name: 'chalk', direct: false, dev: false },
      { ecosystem: 'npm', name: 'body-parser', direct: false, dev: false },
      { ecosystem: 'npm', name: 'debug', direct: false, dev: false },
      { ecosystem: 'npm', name: 'vitest', direct: false, dev: true },
      { ecosystem: 'npm', name: 'tinyspy', direct: false, dev: true },
      { ecosystem: 'npm', name: 'fsevents', direct: false, dev: false },
    ]);
  });

  it('warns about lockfileVersion 1', () => {
    const result = parsePackageLock(read('npm-lock-v1/package-lock.json'), 'package-lock.json');
    expect(result.dependencies).toEqual([]);
    expect(result.warnings).toEqual([
      'package-lock.json: lockfileVersion 1 is not supported (regenerate it with npm 7 or later); transitive npm dependencies were skipped',
    ]);
  });
});

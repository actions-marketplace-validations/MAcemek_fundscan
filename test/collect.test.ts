import { describe, expect, it } from 'vitest';
import { collectDependencies, findDependencyFiles, mergeDependencies } from '../src/collect.js';
import { UsageError } from '../src/errors.js';
import type { Dependency } from '../src/types.js';

const root = (name: string): string => `test/fixtures/projects/${name}`;
const OFF = { all: false, dev: false, recursive: false };
const ids = (deps: Dependency[]): string[] =>
  deps.map(
    (d) => `${d.ecosystem}:${d.name}${d.direct ? '' : ' (transitive)'}${d.dev ? ' (dev)' : ''}`,
  );

describe('findDependencyFiles', () => {
  it('lists supported files in the directory only', async () => {
    expect(await findDependencyFiles(root('python'), false)).toEqual([
      'pyproject.toml',
      'requirements-dev.txt',
      'requirements.txt',
    ]);
    expect(await findDependencyFiles(root('monorepo'), false)).toEqual(['package.json']);
  });

  it('walks subdirectories with recursive, skipping ignored and hidden ones', async () => {
    expect(await findDependencyFiles(root('monorepo'), true)).toEqual([
      'package.json',
      'packages/web/package.json',
      'services/api/requirements.txt',
    ]);
  });
});

describe('mergeDependencies', () => {
  it('merges by ecosystem and name, prefers direct and non-dev, and sorts', () => {
    const merged = mergeDependencies([
      { dependency: { ecosystem: 'pypi', name: 'PyYAML', direct: false, dev: true }, source: 'a' },
      { dependency: { ecosystem: 'npm', name: 'b', direct: true, dev: true }, source: 'a' },
      { dependency: { ecosystem: 'pypi', name: 'pyyaml', direct: true, dev: false }, source: 'b' },
      { dependency: { ecosystem: 'npm', name: 'a', direct: false, dev: false }, source: 'a' },
      { dependency: { ecosystem: 'npm', name: 'a', direct: false, dev: false }, source: 'a' },
    ]);
    expect(merged).toEqual([
      { ecosystem: 'npm', name: 'a', direct: false, dev: false, sources: ['a'] },
      { ecosystem: 'npm', name: 'b', direct: true, dev: true, sources: ['a'] },
      { ecosystem: 'pypi', name: 'pyyaml', direct: true, dev: false, sources: ['a', 'b'] },
    ]);
  });
});

describe('collectDependencies', () => {
  it('reads direct production dependencies by default', async () => {
    const result = await collectDependencies(root('npm'), 'npm', OFF);
    expect(result.files).toEqual(['package.json']);
    expect(ids(result.dependencies)).toEqual([
      'npm:@types/node',
      'npm:chalk',
      'npm:express',
      'npm:fsevents',
    ]);
    expect(result.warnings).toHaveLength(3);
  });

  it('adds dev dependencies with dev', async () => {
    const result = await collectDependencies(root('npm'), 'npm', { ...OFF, dev: true });
    expect(ids(result.dependencies)).toContain('npm:vitest (dev)');
    expect(ids(result.dependencies)).toContain('npm:express');
  });

  it('adds lockfile packages with all', async () => {
    const result = await collectDependencies(root('npm'), 'npm', { ...OFF, all: true });
    expect(result.files).toEqual(['package-lock.json', 'package.json']);
    expect(ids(result.dependencies)).toEqual([
      'npm:@types/node',
      'npm:body-parser (transitive)',
      'npm:chalk',
      'npm:debug (transitive)',
      'npm:express',
      'npm:fsevents',
    ]);
    const express = result.dependencies.find((d) => d.name === 'express');
    expect(express?.sources).toEqual(['package-lock.json', 'package.json']);
  });

  it('combines all and dev', async () => {
    const result = await collectDependencies(root('npm'), 'npm', { ...OFF, all: true, dev: true });
    expect(ids(result.dependencies)).toEqual([
      'npm:@types/node',
      'npm:body-parser (transitive)',
      'npm:chalk',
      'npm:debug (transitive)',
      'npm:express',
      'npm:fsevents',
      'npm:tinyspy (transitive) (dev)',
      'npm:vitest (dev)',
    ]);
  });

  it('treats indirect Go modules as transitive', async () => {
    const direct = await collectDependencies(root('go'), 'go', OFF);
    expect(direct.dependencies.map((d) => d.name)).not.toContain('github.com/spf13/pflag');
    const all = await collectDependencies(root('go'), 'go', { ...OFF, all: true });
    expect(all.dependencies.map((d) => d.name)).toContain('github.com/spf13/pflag');
  });

  it('merges Python files and keeps dev files out by default', async () => {
    const result = await collectDependencies(root('python'), 'python', OFF);
    expect(result.files).toEqual(['pyproject.toml', 'requirements-dev.txt', 'requirements.txt']);
    expect(ids(result.dependencies)).toEqual([
      'pypi:click',
      'pypi:httpx',
      'pypi:pyyaml',
      'pypi:requests',
      'pypi:rich',
      'pypi:typing-extensions',
      'pypi:zope-interface',
    ]);
  });

  it('scans subdirectories with recursive', async () => {
    const result = await collectDependencies(root('monorepo'), 'monorepo', {
      ...OFF,
      recursive: true,
    });
    expect(ids(result.dependencies)).toEqual([
      'npm:chalk',
      'npm:express',
      'pypi:flask',
      'pypi:requests',
    ]);
    expect(result.dependencies.find((d) => d.name === 'express')?.sources).toEqual([
      'package.json',
      'packages/web/package.json',
    ]);
  });

  it('fails with a UsageError when there is nothing to read', async () => {
    await expect(collectDependencies(root('empty'), 'empty', OFF)).rejects.toThrow(UsageError);
    await expect(collectDependencies(root('empty'), 'empty', OFF)).rejects.toThrow(
      'No supported dependency files found in empty.',
    );
  });

  it('fails with a UsageError for a broken file', async () => {
    await expect(collectDependencies(root('broken'), 'broken', OFF)).rejects.toThrow(
      /^Could not parse package\.json: /,
    );
  });
});

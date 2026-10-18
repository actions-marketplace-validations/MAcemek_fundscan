import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCargoLock, parseCargoToml } from '../../src/parsers/cargo.js';
import { parseGoMod } from '../../src/parsers/go.js';

const read = (path: string): string => readFileSync(`test/fixtures/projects/${path}`, 'utf8');
const names = (deps: { name: string; dev: boolean; direct: boolean }[]): string[] =>
  deps.map((d) => `${d.name}${d.dev ? ' (dev)' : ''}${d.direct ? '' : ' (transitive)'}`);

describe('parseCargoToml', () => {
  it('reads every dependency table and skips path, git and other registries', () => {
    const result = parseCargoToml(read('rust/Cargo.toml'), 'Cargo.toml');
    expect(names(result.dependencies)).toEqual([
      'serde',
      'anyhow',
      'serde_json',
      'shared',
      'cc',
      'insta (dev)',
      'windows-sys',
      'tokio',
    ]);
    expect(result.warnings).toEqual([
      'Cargo.toml: skipped "from-git" in [dependencies] (git dependencies are not looked up)',
      'Cargo.toml: skipped "private" in [dependencies] (only crates.io is supported)',
    ]);
  });
});

describe('parseCargoLock', () => {
  it('keeps only crates.io packages', () => {
    const result = parseCargoLock(read('rust/Cargo.lock'), 'Cargo.lock');
    expect(names(result.dependencies)).toEqual(['anyhow (transitive)', 'itoa (transitive)']);
  });
});

describe('parseGoMod', () => {
  it('reads require lines and blocks and marks indirect modules as transitive', () => {
    const result = parseGoMod(read('go/go.mod'));
    expect(names(result.dependencies)).toEqual([
      'github.com/spf13/cobra',
      'github.com/BurntSushi/toml',
      'golang.org/x/sys',
      'github.com/go-chi/chi/v5',
      'github.com/spf13/pflag (transitive)',
      'github.com/davecgh/go-spew (transitive)',
    ]);
    expect(result.warnings).toEqual([]);
  });
});

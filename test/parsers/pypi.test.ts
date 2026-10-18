import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UsageError } from '../../src/errors.js';
import {
  isDevRequirementsFile,
  normalizePypiName,
  parsePoetryLock,
  parsePyproject,
  parseRequirement,
  parseRequirementsTxt,
  parseUvLock,
} from '../../src/parsers/pypi.js';

const read = (path: string): string => readFileSync(`test/fixtures/projects/${path}`, 'utf8');
const names = (deps: { name: string; dev: boolean; direct: boolean }[]): string[] =>
  deps.map((d) => `${d.name}${d.dev ? ' (dev)' : ''}${d.direct ? '' : ' (transitive)'}`);

describe('normalizePypiName', () => {
  it('follows PEP 503', () => {
    expect(normalizePypiName('PyYAML')).toBe('pyyaml');
    expect(normalizePypiName('typing_extensions')).toBe('typing-extensions');
    expect(normalizePypiName('zope.interface')).toBe('zope-interface');
    expect(normalizePypiName('A__b-.-C')).toBe('a-b-c');
  });
});

describe('parseRequirement', () => {
  it('extracts the name from PEP 508 strings', () => {
    expect(parseRequirement('requests[socks]>=2.32; python_version>"3.8"')).toEqual({
      kind: 'ok',
      name: 'requests',
    });
    expect(parseRequirement('Django')).toEqual({ kind: 'ok', name: 'django' });
    expect(parseRequirement('pkg @ https://example.com/pkg.whl')).toEqual({ kind: 'url' });
    expect(parseRequirement('!!')).toEqual({ kind: 'invalid' });
  });
});

describe('isDevRequirementsFile', () => {
  it('detects dev, test, lint, docs and ci files', () => {
    expect(isDevRequirementsFile('requirements.txt')).toBe(false);
    expect(isDevRequirementsFile('requirements-prod.txt')).toBe(false);
    expect(isDevRequirementsFile('requirements-dev.txt')).toBe(true);
    expect(isDevRequirementsFile('requirements_test.txt')).toBe(true);
    expect(isDevRequirementsFile('requirements.docs.txt')).toBe(true);
    expect(isDevRequirementsFile('requirements-ci-py312.txt')).toBe(true);
    expect(isDevRequirementsFile('requirements-devices.txt')).toBe(false);
  });
});

describe('parseRequirementsTxt', () => {
  it('reads names and warns about lines it cannot look up', () => {
    const result = parseRequirementsTxt(read('python/requirements.txt'), 'requirements.txt', false);
    expect(names(result.dependencies)).toEqual([
      'requests',
      'click',
      'pyyaml',
      'typing-extensions',
      'zope-interface',
    ]);
    expect(result.warnings).toEqual([
      'requirements.txt: skipped "-r requirements-dev.txt" (nested requirement files are not followed)',
      'requirements.txt: skipped "-e git+https://github.com/example/editable.git#egg=editable" (editable installs are not looked up)',
      'requirements.txt: skipped "git+https://github.com/example/direct.git" (URLs and local paths are not looked up)',
      'requirements.txt: skipped "./local/path" (URLs and local paths are not looked up)',
      'requirements.txt: skipped "mypkg @ https://example.com/mypkg-1.0.tar.gz" (URLs and local paths are not looked up)',
      'requirements.txt: skipped "!!invalid!!" (not a valid requirement)',
    ]);
  });

  it('marks every entry as dev when asked', () => {
    const result = parseRequirementsTxt('pytest\n', 'requirements-dev.txt', true);
    expect(result.dependencies).toEqual([
      { ecosystem: 'pypi', name: 'pytest', direct: true, dev: true },
    ]);
  });

  it('handles CRLF line endings', () => {
    const result = parseRequirementsTxt('a==1\r\nb==2\r\n', 'requirements.txt', false);
    expect(names(result.dependencies)).toEqual(['a', 'b']);
  });
});

describe('parsePyproject', () => {
  it('reads PEP 621 dependencies, extras and dependency groups', () => {
    const result = parsePyproject(read('python/pyproject.toml'), 'pyproject.toml');
    expect(names(result.dependencies)).toEqual([
      'httpx',
      'rich',
      'mkdocs (dev)',
      'pytest (dev)',
      'ruff (dev)',
    ]);
    expect(result.warnings).toEqual([
      'pyproject.toml: skipped "local @ file:///tmp/local" in [project].dependencies (URLs and local paths are not looked up)',
    ]);
  });

  it('reads Poetry dependencies and groups', () => {
    const result = parsePyproject(read('poetry/pyproject.toml'), 'pyproject.toml');
    expect(names(result.dependencies)).toEqual([
      'django',
      'requests',
      'attrs',
      'black (dev)',
      'pytest (dev)',
    ]);
    expect(result.warnings).toEqual([
      'pyproject.toml: skipped "from-git" in [tool.poetry.dependencies] (not from PyPI)',
    ]);
  });

  it('throws a UsageError for invalid TOML', () => {
    expect(() => parsePyproject('[project\nname = 1', 'pyproject.toml')).toThrow(UsageError);
  });
});

describe('lockfiles', () => {
  it('reads poetry.lock and marks dev-only packages', () => {
    const result = parsePoetryLock(read('poetry/poetry.lock'), 'poetry.lock');
    expect(names(result.dependencies)).toEqual([
      'django (transitive)',
      'sqlparse (transitive)',
      'pytest (dev) (transitive)',
      'pluggy (dev) (transitive)',
    ]);
  });

  it('reads registry packages from uv.lock', () => {
    const result = parseUvLock(read('uv/uv.lock'), 'uv.lock');
    expect(names(result.dependencies)).toEqual(['anyio (transitive)', 'httpx (transitive)']);
  });
});

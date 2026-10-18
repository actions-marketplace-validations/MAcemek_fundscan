import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { errorMessage, UsageError } from './errors.js';
import { compareStrings, dependencyKey } from './keys.js';
import { parseCargoLock, parseCargoToml } from './parsers/cargo.js';
import { parseGoMod } from './parsers/go.js';
import { parsePackageJson, parsePackageLock } from './parsers/npm.js';
import {
  isDevRequirementsFile,
  normalizePypiName,
  parsePoetryLock,
  parsePyproject,
  parseRequirementsTxt,
  parseUvLock,
} from './parsers/pypi.js';
import {
  ECOSYSTEMS,
  type CollectResult,
  type Dependency,
  type ParsedFile,
  type RawDependency,
  type ScanOptions,
} from './types.js';

/** Directories that --recursive never enters (in addition to every directory starting with "."). */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'vendor',
  'target',
  'dist',
  'build',
  'out',
  'coverage',
  'venv',
  '__pycache__',
  'site-packages',
  'bower_components',
]);

interface FileKind {
  lockfile: boolean;
  parse: (content: string, file: string) => ParsedFile;
}

const REQUIREMENTS_FILE = /^requirements.*\.txt$/i;

const FILE_KINDS: Record<string, FileKind> = {
  'package.json': { lockfile: false, parse: parsePackageJson },
  'package-lock.json': { lockfile: true, parse: parsePackageLock },
  'pyproject.toml': { lockfile: false, parse: parsePyproject },
  'poetry.lock': { lockfile: true, parse: parsePoetryLock },
  'uv.lock': { lockfile: true, parse: parseUvLock },
  'Cargo.toml': { lockfile: false, parse: parseCargoToml },
  'Cargo.lock': { lockfile: true, parse: parseCargoLock },
  'go.mod': { lockfile: false, parse: (content) => parseGoMod(content) },
};

function fileKind(basename: string): FileKind | null {
  const known = FILE_KINDS[basename];
  if (known) return known;
  if (REQUIREMENTS_FILE.test(basename)) {
    const dev = isDevRequirementsFile(basename);
    return {
      lockfile: false,
      parse: (content, file) => parseRequirementsTxt(content, file, dev),
    };
  }
  return null;
}

/** Returns supported files under `root` as forward-slash paths relative to it, sorted. */
export async function findDependencyFiles(root: string, recursive: boolean): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      throw new UsageError(`Could not read directory ${prefix || '.'}: ${errorMessage(error)}`);
    }
    entries.sort((a, b) => compareStrings(a.name, b.name));
    for (const entry of entries) {
      if (entry.isFile() && fileKind(entry.name) !== null) {
        found.push(prefix + entry.name);
      }
    }
    if (!recursive) return;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(join(dir, entry.name), `${prefix}${entry.name}/`);
    }
  }
  await walk(root, '');
  return found.sort(compareStrings);
}

function basenameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

export function mergeDependencies(
  items: { dependency: RawDependency; source: string }[],
): Dependency[] {
  const merged = new Map<string, Dependency>();
  for (const { dependency, source } of items) {
    const name =
      dependency.ecosystem === 'pypi' ? normalizePypiName(dependency.name) : dependency.name;
    const key = dependencyKey(dependency.ecosystem, name);
    const existing = merged.get(key);
    if (existing) {
      existing.direct = existing.direct || dependency.direct;
      existing.dev = existing.dev && dependency.dev;
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      merged.set(key, { ...dependency, name, sources: [source] });
    }
  }
  return [...merged.values()].sort(
    (a, b) =>
      ECOSYSTEMS.indexOf(a.ecosystem) - ECOSYSTEMS.indexOf(b.ecosystem) ||
      compareStrings(a.name, b.name),
  );
}

export async function collectDependencies(
  root: string,
  displayRoot: string,
  options: ScanOptions,
): Promise<CollectResult> {
  const candidates = await findDependencyFiles(root, options.recursive);
  const files: string[] = [];
  const warnings: string[] = [];
  const items: { dependency: RawDependency; source: string }[] = [];
  let sawManifest = false;
  for (const file of candidates) {
    const kind = fileKind(basenameOf(file));
    if (!kind) continue;
    if (!kind.lockfile) sawManifest = true;
    if (kind.lockfile && !options.all) continue;
    let content: string;
    try {
      content = await readFile(join(root, file), 'utf8');
    } catch (error) {
      throw new UsageError(`Could not read ${file}: ${errorMessage(error)}`);
    }
    const parsed = kind.parse(content, file);
    files.push(file);
    warnings.push(...parsed.warnings);
    for (const dependency of parsed.dependencies) {
      if (dependency.dev && !options.dev) continue;
      if (!dependency.direct && !options.all) continue;
      items.push({ dependency, source: file });
    }
  }
  if (candidates.length === 0 || (!sawManifest && !options.all)) {
    const hint = options.recursive ? '' : ' Use --recursive to scan subdirectories.';
    throw new UsageError(
      `No supported dependency files found in ${displayRoot}. fundscan reads package.json, package-lock.json, requirements*.txt, pyproject.toml, poetry.lock, uv.lock, Cargo.toml, Cargo.lock and go.mod.${hint}`,
    );
  }
  return { files, dependencies: mergeDependencies(items), warnings };
}

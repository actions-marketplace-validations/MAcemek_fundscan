import type { ParsedFile, RawDependency } from '../types.js';
import { isRecord, parseJsonFile } from './util.js';

const LOCAL_SPEC = /^(file:|link:|workspace:|portal:)/;
const REMOTE_SPEC = /^(git\+|git:|github:|gitlab:|bitbucket:|gist:|https?:)/;
const GITHUB_SHORTHAND = /^[^@\s/][^\s/]*\/[^\s/]+$/;

type SpecResult = { kind: 'registry'; name: string } | { kind: 'local' } | { kind: 'remote' };

/** Decides whether a package.json dependency comes from the npm registry, and under which name. */
export function resolveNpmSpec(name: string, spec: string): SpecResult {
  const trimmed = spec.trim();
  if (trimmed.startsWith('npm:')) {
    const rest = trimmed.slice(4);
    const at = rest.lastIndexOf('@');
    return { kind: 'registry', name: at > 0 ? rest.slice(0, at) : rest };
  }
  if (LOCAL_SPEC.test(trimmed)) return { kind: 'local' };
  if (REMOTE_SPEC.test(trimmed) || GITHUB_SHORTHAND.test(trimmed)) return { kind: 'remote' };
  return { kind: 'registry', name };
}

const SECTIONS: { key: string; dev: boolean }[] = [
  { key: 'dependencies', dev: false },
  { key: 'optionalDependencies', dev: false },
  { key: 'devDependencies', dev: true },
];

export function parsePackageJson(content: string, file: string): ParsedFile {
  const json = parseJsonFile(content, file);
  const dependencies: RawDependency[] = [];
  const warnings: string[] = [];
  for (const section of SECTIONS) {
    const entries = json[section.key];
    if (!isRecord(entries)) continue;
    for (const [name, spec] of Object.entries(entries)) {
      if (typeof spec !== 'string') continue;
      const resolved = resolveNpmSpec(name, spec);
      if (resolved.kind === 'local') continue;
      if (resolved.kind === 'remote') {
        warnings.push(`${file}: skipped "${name}" (not from the npm registry: ${spec})`);
        continue;
      }
      dependencies.push({ ecosystem: 'npm', name: resolved.name, direct: true, dev: section.dev });
    }
  }
  return { dependencies, warnings };
}

const NON_REGISTRY_RESOLVED = /^(git\+|git:|github:|file:)/;
const NODE_MODULES = 'node_modules/';

export function parsePackageLock(content: string, file: string): ParsedFile {
  const json = parseJsonFile(content, file);
  const version = typeof json.lockfileVersion === 'number' ? json.lockfileVersion : 1;
  if (version < 2 || !isRecord(json.packages)) {
    return {
      dependencies: [],
      warnings: [
        `${file}: lockfileVersion ${version} is not supported (regenerate it with npm 7 or later); transitive npm dependencies were skipped`,
      ],
    };
  }
  const dependencies: RawDependency[] = [];
  for (const [path, entry] of Object.entries(json.packages)) {
    if (path === '' || !isRecord(entry)) continue;
    const index = path.lastIndexOf(NODE_MODULES);
    if (index === -1) continue;
    if (entry.link === true) continue;
    if (typeof entry.resolved === 'string' && NON_REGISTRY_RESOLVED.test(entry.resolved)) continue;
    const name =
      typeof entry.name === 'string' ? entry.name : path.slice(index + NODE_MODULES.length);
    const dev = entry.dev === true || entry.devOptional === true;
    dependencies.push({ ecosystem: 'npm', name, direct: false, dev });
  }
  return { dependencies, warnings: [] };
}

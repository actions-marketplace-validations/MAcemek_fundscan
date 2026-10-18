import type { ParsedFile, RawDependency } from '../types.js';
import { isRecord, parseTomlFile, splitLines, stripBom } from './util.js';

/** PEP 503 normalization: lowercase, runs of "-", "_" and "." become a single "-". */
export function normalizePypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

const PEP508_NAME = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(\[[^\]]*\])?\s*(.*)$/s;

type RequirementResult = { kind: 'ok'; name: string } | { kind: 'url' } | { kind: 'invalid' };

/** Extracts the normalized project name from a PEP 508 requirement string. */
export function parseRequirement(requirement: string): RequirementResult {
  const match = PEP508_NAME.exec(requirement.trim());
  if (!match?.[1]) return { kind: 'invalid' };
  const rest = (match[3] ?? '').trim();
  if (rest.startsWith('@')) return { kind: 'url' };
  return { kind: 'ok', name: normalizePypiName(match[1]) };
}

const URL_OR_PATH = /^([a-z][a-z0-9+.-]*:\/\/|git\+|\.|\/|~)/i;

export function parseRequirementsTxt(content: string, file: string, dev: boolean): ParsedFile {
  const dependencies: RawDependency[] = [];
  const warnings: string[] = [];
  const joined = stripBom(content).replace(/\\\r?\n/g, ' ');
  for (const rawLine of splitLines(joined)) {
    const line = rawLine.replace(/(^|\s)#.*$/, '').trim();
    if (line === '') continue;
    if (/^(-r|--requirement|-c|--constraint)(\s|=|$)/.test(line)) {
      warnings.push(`${file}: skipped "${line}" (nested requirement files are not followed)`);
      continue;
    }
    if (/^(-e|--editable)(\s|=|$)/.test(line)) {
      warnings.push(`${file}: skipped "${line}" (editable installs are not looked up)`);
      continue;
    }
    if (line.startsWith('-')) continue;
    if (URL_OR_PATH.test(line)) {
      warnings.push(`${file}: skipped "${line}" (URLs and local paths are not looked up)`);
      continue;
    }
    const requirement = line.split(/\s+--?[A-Za-z]/)[0] ?? line;
    const result = parseRequirement(requirement);
    if (result.kind === 'url') {
      warnings.push(`${file}: skipped "${line}" (URLs and local paths are not looked up)`);
    } else if (result.kind === 'invalid') {
      warnings.push(`${file}: skipped "${line}" (not a valid requirement)`);
    } else {
      dependencies.push({ ecosystem: 'pypi', name: result.name, direct: true, dev });
    }
  }
  return { dependencies, warnings };
}

/** requirements-dev.txt, requirements_test.txt, requirements.docs.txt and similar are dev files. */
export function isDevRequirementsFile(basename: string): boolean {
  const middle = basename
    .toLowerCase()
    .replace(/^requirements/, '')
    .replace(/\.txt$/, '');
  return /(^|[-_.])(dev|develop|development|test|tests|testing|lint|docs?|ci)([-_.]|$)/.test(
    middle,
  );
}

function addRequirementStrings(
  list: unknown,
  file: string,
  dev: boolean,
  out: ParsedFile,
  where: string,
): void {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const result = parseRequirement(item);
    if (result.kind === 'ok') {
      out.dependencies.push({ ecosystem: 'pypi', name: result.name, direct: true, dev });
    } else if (result.kind === 'url') {
      out.warnings.push(
        `${file}: skipped "${item}" in ${where} (URLs and local paths are not looked up)`,
      );
    } else {
      out.warnings.push(`${file}: skipped "${item}" in ${where} (not a valid requirement)`);
    }
  }
}

function addPoetryTable(
  table: unknown,
  file: string,
  dev: boolean,
  out: ParsedFile,
  where: string,
): void {
  if (!isRecord(table)) return;
  for (const [key, value] of Object.entries(table)) {
    if (key.toLowerCase() === 'python') continue;
    const specs = Array.isArray(value) ? value : [value];
    const tables = specs.filter(isRecord);
    if (tables.some((spec) => spec.path !== undefined)) continue;
    if (tables.some((spec) => spec.git !== undefined || spec.url !== undefined)) {
      out.warnings.push(`${file}: skipped "${key}" in ${where} (not from PyPI)`);
      continue;
    }
    out.dependencies.push({ ecosystem: 'pypi', name: normalizePypiName(key), direct: true, dev });
  }
}

export function parsePyproject(content: string, file: string): ParsedFile {
  const doc = parseTomlFile(content, file);
  const out: ParsedFile = { dependencies: [], warnings: [] };
  const project = doc.project;
  if (isRecord(project)) {
    addRequirementStrings(project.dependencies, file, false, out, '[project].dependencies');
    const optional = project['optional-dependencies'];
    if (isRecord(optional)) {
      for (const [extra, list] of Object.entries(optional)) {
        addRequirementStrings(list, file, true, out, `[project.optional-dependencies].${extra}`);
      }
    }
  }
  const groups = doc['dependency-groups'];
  if (isRecord(groups)) {
    for (const [group, list] of Object.entries(groups)) {
      addRequirementStrings(list, file, true, out, `[dependency-groups].${group}`);
    }
  }
  const tool = doc.tool;
  const poetry = isRecord(tool) ? tool.poetry : undefined;
  if (isRecord(poetry)) {
    addPoetryTable(poetry.dependencies, file, false, out, '[tool.poetry.dependencies]');
    addPoetryTable(poetry['dev-dependencies'], file, true, out, '[tool.poetry.dev-dependencies]');
    if (isRecord(poetry.group)) {
      for (const [group, value] of Object.entries(poetry.group)) {
        if (!isRecord(value)) continue;
        addPoetryTable(
          value.dependencies,
          file,
          true,
          out,
          `[tool.poetry.group.${group}.dependencies]`,
        );
      }
    }
  }
  return out;
}

const POETRY_NON_REGISTRY = new Set(['git', 'url', 'directory', 'file']);

export function parsePoetryLock(content: string, file: string): ParsedFile {
  const doc = parseTomlFile(content, file);
  const dependencies: RawDependency[] = [];
  const packages = Array.isArray(doc.package) ? doc.package : [];
  for (const entry of packages) {
    if (!isRecord(entry) || typeof entry.name !== 'string') continue;
    if (isRecord(entry.source) && POETRY_NON_REGISTRY.has(String(entry.source.type))) continue;
    const groups = Array.isArray(entry.groups) ? entry.groups : null;
    const dev =
      entry.category === 'dev' ||
      (groups !== null && groups.length > 0 && !groups.includes('main'));
    dependencies.push({
      ecosystem: 'pypi',
      name: normalizePypiName(entry.name),
      direct: false,
      dev,
    });
  }
  return { dependencies, warnings: [] };
}

export function parseUvLock(content: string, file: string): ParsedFile {
  const doc = parseTomlFile(content, file);
  const dependencies: RawDependency[] = [];
  const packages = Array.isArray(doc.package) ? doc.package : [];
  for (const entry of packages) {
    if (!isRecord(entry) || typeof entry.name !== 'string') continue;
    if (!isRecord(entry.source) || typeof entry.source.registry !== 'string') continue;
    dependencies.push({
      ecosystem: 'pypi',
      name: normalizePypiName(entry.name),
      direct: false,
      dev: false,
    });
  }
  return { dependencies, warnings: [] };
}

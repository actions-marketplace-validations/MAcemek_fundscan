import type { ParsedFile } from '../types.js';
import { isRecord, parseTomlFile } from './util.js';

const SECTIONS: { key: string; dev: boolean }[] = [
  { key: 'dependencies', dev: false },
  { key: 'build-dependencies', dev: false },
  { key: 'dev-dependencies', dev: true },
];

function addCargoTable(
  table: unknown,
  file: string,
  dev: boolean,
  out: ParsedFile,
  where: string,
): void {
  if (!isRecord(table)) return;
  for (const [key, value] of Object.entries(table)) {
    if (typeof value === 'string') {
      out.dependencies.push({ ecosystem: 'cargo', name: key, direct: true, dev });
      continue;
    }
    if (!isRecord(value)) continue;
    if (value.path !== undefined) continue;
    if (value.git !== undefined) {
      out.warnings.push(
        `${file}: skipped "${key}" in ${where} (git dependencies are not looked up)`,
      );
      continue;
    }
    if (value.registry !== undefined || value['registry-index'] !== undefined) {
      out.warnings.push(`${file}: skipped "${key}" in ${where} (only crates.io is supported)`);
      continue;
    }
    const name = typeof value.package === 'string' ? value.package : key;
    out.dependencies.push({ ecosystem: 'cargo', name, direct: true, dev });
  }
}

export function parseCargoToml(content: string, file: string): ParsedFile {
  const doc = parseTomlFile(content, file);
  const out: ParsedFile = { dependencies: [], warnings: [] };
  for (const section of SECTIONS) {
    addCargoTable(doc[section.key], file, section.dev, out, `[${section.key}]`);
  }
  if (isRecord(doc.target)) {
    for (const [target, value] of Object.entries(doc.target)) {
      if (!isRecord(value)) continue;
      for (const section of SECTIONS) {
        addCargoTable(
          value[section.key],
          file,
          section.dev,
          out,
          `[target.'${target}'.${section.key}]`,
        );
      }
    }
  }
  if (isRecord(doc.workspace)) {
    addCargoTable(doc.workspace.dependencies, file, false, out, '[workspace.dependencies]');
  }
  return out;
}

const CRATES_IO_SOURCES = [
  'registry+https://github.com/rust-lang/crates.io-index',
  'sparse+https://index.crates.io/',
];

export function parseCargoLock(content: string, file: string): ParsedFile {
  const doc = parseTomlFile(content, file);
  const out: ParsedFile = { dependencies: [], warnings: [] };
  const packages = Array.isArray(doc.package) ? doc.package : [];
  for (const entry of packages) {
    if (!isRecord(entry) || typeof entry.name !== 'string') continue;
    const source = entry.source;
    if (typeof source !== 'string' || !CRATES_IO_SOURCES.some((s) => source.startsWith(s))) {
      continue;
    }
    out.dependencies.push({ ecosystem: 'cargo', name: entry.name, direct: false, dev: false });
  }
  return out;
}

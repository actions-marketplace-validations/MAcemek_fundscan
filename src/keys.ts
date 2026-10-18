import { normalizePypiName } from './parsers/pypi.js';
import type { Ecosystem } from './types.js';

/** Plain code-unit comparison, so sorting does not depend on the locale. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The key used to merge duplicates and to match API results. PyPI names are compared after PEP 503 normalization. */
export function dependencyKey(ecosystem: Ecosystem, name: string): string {
  return `${ecosystem}:${ecosystem === 'pypi' ? normalizePypiName(name) : name}`;
}

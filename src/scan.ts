import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectDependencies } from './collect.js';
import { lookupPackages, type LookupDeps } from './ecosystems.js';
import { UsageError } from './errors.js';
import { buildReport, type BudgetOptions } from './report.js';
import type { PackageInfo, Report, ScanOptions } from './types.js';

export interface ScanRequest {
  /** The path as the user wrote it; shown in the report. */
  path: string;
  cwd: string;
  options: ScanOptions;
  budget: BudgetOptions | null;
}

export function displayPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized === '' ? '.' : normalized;
}

/** Reads the dependency files, looks the packages up and builds the report. */
export async function scan(request: ScanRequest, deps: LookupDeps): Promise<Report> {
  const root = resolve(request.cwd, request.path);
  const shown = displayPath(request.path);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) {
    throw new UsageError(`Path not found or not a directory: ${shown}`);
  }
  const collected = await collectDependencies(root, shown, request.options);
  const packages =
    collected.dependencies.length > 0
      ? await lookupPackages(collected.dependencies, deps)
      : new Map<string, PackageInfo>();
  return buildReport({
    root: shown,
    options: request.options,
    collected,
    packages,
    budget: request.budget,
    now: deps.now(),
  });
}

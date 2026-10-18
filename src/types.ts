export const ECOSYSTEMS = ['npm', 'pypi', 'cargo', 'go'] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

export const ECOSYSTEM_LABELS: Record<Ecosystem, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  cargo: 'Cargo',
  go: 'Go',
};

export const FLAG_IDS = ['deprecated', 'archived', 'stale', 'concentrated', 'unknown'] as const;
export type FlagId = (typeof FLAG_IDS)[number];

export const PLATFORM_IDS = [
  'github',
  'opencollective',
  'patreon',
  'ko-fi',
  'liberapay',
  'tidelift',
  'thanks-dev',
  'polar',
  'buymeacoffee',
  'custom',
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export const PLATFORM_NAMES: Record<PlatformId, string> = {
  github: 'GitHub Sponsors',
  opencollective: 'Open Collective',
  patreon: 'Patreon',
  'ko-fi': 'Ko-fi',
  liberapay: 'Liberapay',
  tidelift: 'Tidelift',
  'thanks-dev': 'thanks.dev',
  polar: 'Polar',
  buymeacoffee: 'Buy Me a Coffee',
  custom: 'Other',
};

export type OutputFormat = 'text' | 'markdown' | 'json';

/** A dependency as read from one manifest or lockfile, before merging. */
export interface RawDependency {
  ecosystem: Ecosystem;
  name: string;
  direct: boolean;
  dev: boolean;
}

/** The result of parsing one file. */
export interface ParsedFile {
  dependencies: RawDependency[];
  warnings: string[];
}

/** A dependency after merging every file it appeared in. */
export interface Dependency extends RawDependency {
  sources: string[];
}

export interface ScanOptions {
  all: boolean;
  dev: boolean;
  recursive: boolean;
}

export interface CollectResult {
  files: string[];
  dependencies: Dependency[];
  warnings: string[];
}

export interface CommitStats {
  totalCommits: number;
  totalCommitters: number;
  dds: number;
}

/** The fields fundscan reads from an ecosyste.ms package record. */
export interface PackageInfo {
  status: string | null;
  fundingLinks: string[];
  latestReleaseAt: string | null;
  repositoryUrl: string | null;
  registryUrl: string | null;
  archived: boolean;
  pushedAt: string | null;
  commitStats: CommitStats | null;
}

export interface Flag {
  id: FlagId;
  detail: string;
}

export interface DependencyReport {
  ecosystem: Ecosystem;
  name: string;
  direct: boolean;
  dev: boolean;
  sources: string[];
  found: boolean;
  flags: Flag[];
  funding: string[];
  repositoryUrl: string | null;
  registryUrl: string | null;
  latestReleaseAt: string | null;
  pushedAt: string | null;
}

export interface FundingDestination {
  rank: number;
  key: string;
  platform: PlatformId;
  platformName: string;
  url: string;
  dependencyCount: number;
  dependencies: string[];
}

export interface BudgetPart {
  key: string;
  url: string;
  amountCents: number;
}

export interface BudgetPlan {
  currency: string;
  totalCents: number;
  parts: BudgetPart[];
}

export interface ReportSummary {
  dependencies: number;
  byEcosystem: Record<Ecosystem, number>;
  withFunding: number;
  withoutFunding: number;
  flagged: number;
  byFlag: Record<FlagId, number>;
  destinations: number;
}

export interface Report {
  schemaVersion: 1;
  tool: { name: 'fundscan'; version: string };
  generatedAt: string;
  root: string;
  options: ScanOptions;
  files: string[];
  summary: ReportSummary;
  destinations: FundingDestination[];
  budget: BudgetPlan | null;
  dependencies: DependencyReport[];
  warnings: string[];
}

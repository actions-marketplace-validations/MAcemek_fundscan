import { budgetWeights, splitBudget } from './budget.js';
import { buildDestinations, classifyPackageFunding } from './funding.js';
import { evaluateHealth } from './health.js';
import { dependencyKey } from './keys.js';
import {
  ECOSYSTEMS,
  FLAG_IDS,
  type BudgetPlan,
  type CollectResult,
  type DependencyReport,
  type Ecosystem,
  type FlagId,
  type PackageInfo,
  type Report,
  type ScanOptions,
} from './types.js';
import { VERSION } from './version.js';

export interface BudgetOptions {
  totalCents: number;
  currency: string;
}

export interface BuildReportInput {
  root: string;
  options: ScanOptions;
  collected: CollectResult;
  packages: Map<string, PackageInfo>;
  budget: BudgetOptions | null;
  now: Date;
}

export function dependencyId(dependency: { ecosystem: Ecosystem; name: string }): string {
  return `${dependency.ecosystem}:${dependency.name}`;
}

export function buildReport(input: BuildReportInput): Report {
  const fundingEntries: Parameters<typeof buildDestinations>[0] = [];
  const dependencies: DependencyReport[] = input.collected.dependencies.map((dependency) => {
    const info = input.packages.get(dependencyKey(dependency.ecosystem, dependency.name));
    const links = info ? classifyPackageFunding(info.fundingLinks) : [];
    fundingEntries.push({ id: dependencyId(dependency), links });
    return {
      ecosystem: dependency.ecosystem,
      name: dependency.name,
      direct: dependency.direct,
      dev: dependency.dev,
      sources: dependency.sources,
      found: info !== undefined,
      flags: evaluateHealth(info, input.now),
      funding: links.map((link) => link.url),
      repositoryUrl: info?.repositoryUrl ?? null,
      registryUrl: info?.registryUrl ?? null,
      latestReleaseAt: info?.latestReleaseAt ?? null,
      pushedAt: info?.pushedAt ?? null,
    };
  });
  const destinations = buildDestinations(fundingEntries);

  const byEcosystem = Object.fromEntries(ECOSYSTEMS.map((e) => [e, 0])) as Record<
    Ecosystem,
    number
  >;
  const byFlag = Object.fromEntries(FLAG_IDS.map((f) => [f, 0])) as Record<FlagId, number>;
  for (const dependency of dependencies) {
    byEcosystem[dependency.ecosystem]++;
    for (const flag of dependency.flags) byFlag[flag.id]++;
  }
  const withFunding = dependencies.filter((d) => d.funding.length > 0).length;

  let budget: BudgetPlan | null = null;
  if (input.budget) {
    const weights = budgetWeights(
      fundingEntries.map((entry) => entry.links.map((link) => link.key)),
      destinations.map((d) => d.key),
    );
    const amounts = splitBudget(input.budget.totalCents, weights);
    budget = {
      currency: input.budget.currency,
      totalCents: input.budget.totalCents,
      parts: destinations.map((d, index) => ({
        key: d.key,
        url: d.url,
        amountCents: amounts[index] ?? 0,
      })),
    };
  }

  return {
    schemaVersion: 1,
    tool: { name: 'fundscan', version: VERSION },
    generatedAt: input.now.toISOString(),
    root: input.root,
    options: { ...input.options },
    files: input.collected.files,
    summary: {
      dependencies: dependencies.length,
      byEcosystem,
      withFunding,
      withoutFunding: dependencies.length - withFunding,
      flagged: dependencies.filter((d) => d.flags.length > 0).length,
      byFlag,
      destinations: destinations.length,
    },
    destinations,
    budget,
    dependencies,
    warnings: input.collected.warnings,
  };
}

/** Dependencies with at least one of the given flags. */
export function matchFailOn(report: Report, failOn: FlagId[]): DependencyReport[] {
  if (failOn.length === 0) return [];
  return report.dependencies.filter((d) => d.flags.some((flag) => failOn.includes(flag.id)));
}

export function failOnMessage(count: number, failOn: FlagId[]): string {
  const noun = count === 1 ? 'dependency' : 'dependencies';
  return `${count} ${noun} matched fail-on (${failOn.join(', ')}).`;
}

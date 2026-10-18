import { formatCents } from '../budget.js';
import { ECOSYSTEM_LABELS, ECOSYSTEMS, type DependencyReport, type Report } from '../types.js';

/** How many covered dependency names to list per destination before "+N more". */
export const COVERS_LIMIT = 5;

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function nameFromId(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

export function coversList(ids: string[]): string {
  const names = ids.slice(0, COVERS_LIMIT).map(nameFromId);
  const more = ids.length - names.length;
  return more > 0 ? `${names.join(', ')}, +${more} more` : names.join(', ');
}

export function ecosystemBreakdown(report: Report): string {
  return ECOSYSTEMS.filter((e) => report.summary.byEcosystem[e] > 0)
    .map((e) => `${ECOSYSTEM_LABELS[e]} ${report.summary.byEcosystem[e]}`)
    .join(', ');
}

export function dependencyLine(report: Report): string {
  const count = plural(report.summary.dependencies, 'dependency', 'dependencies');
  const breakdown = ecosystemBreakdown(report);
  return breakdown === '' ? count : `${count}: ${breakdown}`;
}

export function fundingSummary(report: Report): string {
  const { dependencies, withFunding, destinations } = report.summary;
  if (dependencies === 0) return 'No dependencies to look up.';
  if (destinations === 0) {
    return `None of the ${plural(dependencies, 'dependency', 'dependencies')} list a funding link.`;
  }
  return `${withFunding} of ${plural(dependencies, 'dependency', 'dependencies')} list funding, through ${plural(destinations, 'destination')}.`;
}

export function unfundedNames(report: Report): string[] {
  return report.dependencies.filter((d) => d.found && d.funding.length === 0).map((d) => d.name);
}

export function flaggedDependencies(report: Report): DependencyReport[] {
  return report.dependencies.filter((d) => d.flags.length > 0);
}

export function riskSummary(report: Report): string {
  const { dependencies, flagged } = report.summary;
  if (flagged === 0) return 'No dependencies are flagged.';
  return `${flagged} of ${plural(dependencies, 'dependency', 'dependencies')} ${flagged === 1 ? 'is' : 'are'} flagged.`;
}

export function budgetTitle(report: Report): string {
  if (!report.budget) return '';
  return `Suggested split of ${formatCents(report.budget.totalCents)} ${report.budget.currency}`;
}

export function money(cents: number, currency: string): string {
  return `${formatCents(cents)} ${currency}`;
}

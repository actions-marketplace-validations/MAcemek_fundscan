import { formatCents } from '../budget.js';
import { ECOSYSTEM_LABELS, type Report } from '../types.js';
import {
  budgetTitle,
  coversList,
  dependencyLine,
  flaggedDependencies,
  fundingSummary,
  riskSummary,
  unfundedNames,
} from './shared.js';

const BOLD = '\u001b[1m';
const YELLOW = '\u001b[33m';
const RESET = '\u001b[0m';

type Align = 'left' | 'right';

/** Renders an aligned table. Each line starts with two spaces; trailing spaces are removed. */
export function renderTable(
  header: string[],
  rows: string[][],
  align: Align[],
  style?: (column: number, cell: string) => string,
): string[] {
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const last = header.length - 1;
  const renderRow = (row: string[], styled: boolean): string => {
    const cells = header.map((_, column) => {
      const cell = row[column] ?? '';
      const width = widths[column] ?? 0;
      const padded =
        align[column] === 'right'
          ? cell.padStart(width)
          : column === last
            ? cell
            : cell.padEnd(width);
      return styled && style ? style(column, padded) : padded;
    });
    return `  ${cells.join('  ')}`.trimEnd();
  };
  return [renderRow(header, false), ...rows.map((row) => renderRow(row, true))];
}

export function formatText(report: Report, options: { color: boolean }): string {
  const bold = (text: string): string => (options.color ? `${BOLD}${text}${RESET}` : text);
  const yellow = (text: string): string => (options.color ? `${YELLOW}${text}${RESET}` : text);
  const lines: string[] = [];

  lines.push(bold(`fundscan ${report.tool.version}`));
  const files = report.files.length > 0 ? report.files.join(', ') : 'none';
  lines.push(`Scanned ${report.root}: ${files}`);
  lines.push(dependencyLine(report));

  lines.push('', bold('Who to fund'), `  ${fundingSummary(report)}`);
  if (report.destinations.length > 0) {
    lines.push('');
    lines.push(
      ...renderTable(
        ['#', 'Deps', 'Platform', 'Destination', 'Covers'],
        report.destinations.map((d) => [
          String(d.rank),
          String(d.dependencyCount),
          d.platformName,
          d.url,
          coversList(d.dependencies),
        ]),
        ['right', 'right', 'left', 'left', 'left'],
      ),
    );
  }
  const unfunded = unfundedNames(report);
  if (unfunded.length > 0 && report.destinations.length > 0) {
    lines.push('', `  No funding listed: ${unfunded.join(', ')}`);
  }

  if (report.budget) {
    lines.push('', bold(budgetTitle(report)));
    if (report.budget.parts.length === 0) {
      lines.push('  No funding destinations, so there is nothing to split.');
    } else {
      lines.push(
        ...renderTable(
          ['Amount', 'Destination'],
          report.budget.parts.map((part) => [formatCents(part.amountCents), part.url]),
          ['right', 'left'],
        ),
      );
    }
  }

  lines.push('', bold('Dependencies at risk'), `  ${riskSummary(report)}`);
  const flagged = flaggedDependencies(report);
  if (flagged.length > 0) {
    lines.push('');
    lines.push(
      ...renderTable(
        ['Package', 'Ecosystem', 'Flags', 'Details'],
        flagged.map((d) => [
          d.name,
          ECOSYSTEM_LABELS[d.ecosystem],
          d.flags.map((flag) => flag.id).join(', '),
          d.flags.map((flag) => flag.detail).join('; '),
        ]),
        ['left', 'left', 'left', 'left'],
        (column, cell) => (column === 2 ? yellow(cell) : cell),
      ),
    );
  }

  if (report.warnings.length > 0) {
    lines.push('', bold('Warnings'));
    for (const warning of report.warnings) lines.push(`  - ${warning}`);
  }

  lines.push('', 'Data from packages.ecosyste.ms');
  return `${lines.join('\n')}\n`;
}

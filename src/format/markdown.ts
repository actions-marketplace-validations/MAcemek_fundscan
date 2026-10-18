import { ECOSYSTEM_LABELS, type Report } from '../types.js';
import { HOMEPAGE } from '../version.js';
import {
  budgetTitle,
  coversList,
  dependencyLine,
  flaggedDependencies,
  fundingSummary,
  money,
  riskSummary,
  unfundedNames,
} from './shared.js';

/** Escapes characters that would otherwise be read as Markdown or HTML. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, (char) => `\\${char}`).replace(/\r?\n/g, ' ');
}

export function markdownLink(url: string): string {
  const label = escapeMarkdown(url.replace(/^https?:\/\//, ''));
  const target = url.replace(
    /[()\s]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
  return `[${label}](${target})`;
}

function table(header: string[], align: ('left' | 'right')[], rows: string[][]): string[] {
  return [
    `| ${header.join(' | ')} |`,
    `| ${align.map((a) => (a === 'right' ? '--:' : '---')).join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

export function formatMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push('## fundscan report', '');
  const files = report.files.map((file) => `\`${file}\``).join(', ');
  lines.push(`Scanned \`${report.root}\`: ${files === '' ? 'no files' : files}.`);
  lines.push(`${escapeMarkdown(dependencyLine(report))}.`);

  lines.push('', '### Who to fund', '', fundingSummary(report));
  if (report.destinations.length > 0) {
    lines.push(
      '',
      ...table(
        ['#', 'Destination', 'Platform', 'Deps', 'Covers'],
        ['right', 'left', 'left', 'right', 'left'],
        report.destinations.map((d) => [
          String(d.rank),
          markdownLink(d.url),
          d.platformName,
          String(d.dependencyCount),
          escapeMarkdown(coversList(d.dependencies)),
        ]),
      ),
    );
  }
  const unfunded = unfundedNames(report);
  if (unfunded.length > 0 && report.destinations.length > 0) {
    lines.push('', `No funding listed: ${escapeMarkdown(unfunded.join(', '))}.`);
  }

  if (report.budget) {
    lines.push('', `### ${budgetTitle(report)}`, '');
    if (report.budget.parts.length === 0) {
      lines.push('No funding destinations, so there is nothing to split.');
    } else {
      const currency = report.budget.currency;
      lines.push(
        ...table(
          ['Destination', 'Amount'],
          ['left', 'right'],
          report.budget.parts.map((part) => [
            markdownLink(part.url),
            escapeMarkdown(money(part.amountCents, currency)),
          ]),
        ),
      );
    }
  }

  lines.push('', '### Dependencies at risk', '', riskSummary(report));
  const flagged = flaggedDependencies(report);
  if (flagged.length > 0) {
    lines.push(
      '',
      ...table(
        ['Package', 'Ecosystem', 'Flags', 'Details'],
        ['left', 'left', 'left', 'left'],
        flagged.map((d) => [
          escapeMarkdown(d.name),
          ECOSYSTEM_LABELS[d.ecosystem],
          d.flags.map((flag) => flag.id).join(', '),
          escapeMarkdown(d.flags.map((flag) => flag.detail).join('; ')),
        ]),
      ),
    );
  }

  if (report.warnings.length > 0) {
    lines.push('', '### Warnings', '');
    for (const warning of report.warnings) lines.push(`- ${escapeMarkdown(warning)}`);
  }

  lines.push(
    '',
    `Data from [ecosyste.ms](https://ecosyste.ms). Report by [fundscan](${HOMEPAGE}) ${report.tool.version}.`,
  );
  return `${lines.join('\n')}\n`;
}

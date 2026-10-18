import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCurrency, parseFailOn } from './args.js';
import { parseBudget } from './budget.js';
import type { FetchFn } from './ecosystems.js';
import { errorMessage, UsageError } from './errors.js';
import { formatJson } from './format/index.js';
import { formatMarkdown } from './format/markdown.js';
import { formatText } from './format/text.js';
import { failOnMessage, matchFailOn } from './report.js';
import { scan } from './scan.js';
import type { FlagId, ScanOptions } from './types.js';

export const REPORT_FILE_NAME = 'fundscan-report.json';

export interface ActionInputs {
  path: string;
  options: ScanOptions;
  budgetCents: number | null;
  currency: string;
  failOn: FlagId[];
}

export interface ActionDeps {
  getInput: (name: string) => string;
  fetch: FetchFn;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  cwd: string;
  tempDir: string;
  info: (message: string) => void;
  warning: (message: string) => void;
  writeSummary: (markdown: string) => Promise<void>;
  setOutput: (name: string, value: string) => void;
  setFailed: (message: string) => void;
}

function parseBoolean(name: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'false') return false;
  if (normalized === 'true') return true;
  throw new UsageError(`Input "${name}" must be true or false, got "${value}".`);
}

export function readActionInputs(getInput: (name: string) => string): ActionInputs {
  const budget = getInput('budget').trim();
  return {
    path: getInput('path').trim() || '.',
    options: {
      all: parseBoolean('all', getInput('all')),
      dev: parseBoolean('dev', getInput('dev')),
      recursive: parseBoolean('recursive', getInput('recursive')),
    },
    budgetCents: budget === '' ? null : parseBudget(budget),
    currency: parseCurrency(getInput('currency').trim() || 'USD'),
    failOn: parseFailOn(getInput('fail-on')),
  };
}

/** Runs the GitHub Action. Reports problems through setFailed and never throws. */
export async function runAction(deps: ActionDeps): Promise<void> {
  try {
    const inputs = readActionInputs(deps.getInput);
    const report = await scan(
      {
        path: inputs.path,
        cwd: deps.cwd,
        options: inputs.options,
        budget:
          inputs.budgetCents === null
            ? null
            : { totalCents: inputs.budgetCents, currency: inputs.currency },
      },
      { fetch: deps.fetch, sleep: deps.sleep, now: deps.now },
    );
    deps.info(formatText(report, { color: false }));
    for (const warning of report.warnings) deps.warning(warning);
    await deps.writeSummary(formatMarkdown(report));

    const reportPath = join(deps.tempDir, REPORT_FILE_NAME);
    await writeFile(reportPath, formatJson(report), 'utf8');

    deps.setOutput('dependency-count', String(report.summary.dependencies));
    deps.setOutput('flagged-count', String(report.summary.flagged));
    deps.setOutput('destination-count', String(report.summary.destinations));
    deps.setOutput('funding-destinations', JSON.stringify(report.destinations.map((d) => d.url)));
    deps.setOutput('report-json', reportPath);

    const matched = matchFailOn(report, inputs.failOn);
    if (matched.length > 0) {
      deps.setFailed(failOnMessage(matched.length, inputs.failOn));
    }
  } catch (error) {
    deps.setFailed(errorMessage(error));
  }
}

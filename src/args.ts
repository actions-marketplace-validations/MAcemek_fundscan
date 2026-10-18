import { parseArgs } from 'node:util';
import { parseBudget } from './budget.js';
import { errorMessage, UsageError } from './errors.js';
import { FLAG_IDS, type FlagId, type OutputFormat } from './types.js';

export const HELP_TEXT = `Usage: fundscan [path] [options]

Reads the dependency files in a project and reports who to fund and which
dependencies are at risk. Supports npm, PyPI, Cargo and Go.

Options:
  --format <format>     text, markdown or json (default: text)
  --all                 Include transitive dependencies from lockfiles
  --dev                 Include development dependencies
  --recursive           Also scan subdirectories (skips hidden directories,
                        node_modules, vendor, target, dist, build and others)
  --budget <amount>     Suggest how to split this amount across destinations
  --currency <code>     Currency label for --budget (default: USD)
  --fail-on <flags>     Exit with code 1 if a dependency has one of these flags,
                        comma-separated: deprecated, archived, stale,
                        concentrated, unknown
  -o, --output <file>   Write the report to a file instead of stdout
  --no-color            Disable colors
  -h, --help            Show this help
  -v, --version         Show the version

Exit codes: 0 success, 1 --fail-on matched, 2 usage or input error,
3 network or API error.

Only package names are sent to the ecosyste.ms API. Files are read locally.
`;

export interface CliOptions {
  path: string;
  format: OutputFormat;
  all: boolean;
  dev: boolean;
  recursive: boolean;
  budgetCents: number | null;
  currency: string;
  failOn: FlagId[];
  output: string | null;
  noColor: boolean;
}

export type ParsedArgs =
  { kind: 'help' } | { kind: 'version' } | { kind: 'run'; options: CliOptions };

const FORMATS: readonly OutputFormat[] = ['text', 'markdown', 'json'];

/** Parses a comma-separated list of flag IDs. An empty string means none. */
export function parseFailOn(value: string): FlagId[] {
  const result: FlagId[] = [];
  for (const part of value.split(',')) {
    const id = part.trim().toLowerCase();
    if (id === '') continue;
    if (!(FLAG_IDS as readonly string[]).includes(id)) {
      throw new UsageError(`Unknown fail-on value "${part.trim()}". Use ${FLAG_IDS.join(', ')}.`);
    }
    if (!result.includes(id as FlagId)) result.push(id as FlagId);
  }
  return result;
}

export function parseCurrency(value: string): string {
  const trimmed = value.trim();
  if (!/^\S{1,10}$/.test(trimmed)) {
    throw new UsageError(`Invalid currency "${value}". Use a short label such as USD or EUR.`);
  }
  return trimmed;
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string' },
        all: { type: 'boolean' },
        dev: { type: 'boolean' },
        recursive: { type: 'boolean' },
        budget: { type: 'string' },
        currency: { type: 'string' },
        'fail-on': { type: 'string' },
        output: { type: 'string', short: 'o' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  if (positionals.length > 1) {
    throw new UsageError(`Expected at most one path, got ${positionals.length}.`);
  }
  const format = values.format ?? 'text';
  if (!(FORMATS as readonly string[]).includes(format)) {
    throw new UsageError(`Unknown format "${format}". Use text, markdown or json.`);
  }
  if (values.output === '') throw new UsageError('--output needs a file name.');
  return {
    kind: 'run',
    options: {
      path: positionals[0] ?? '.',
      format: format as OutputFormat,
      all: values.all ?? false,
      dev: values.dev ?? false,
      recursive: values.recursive ?? false,
      budgetCents: values.budget === undefined ? null : parseBudget(values.budget),
      currency: parseCurrency(values.currency ?? 'USD'),
      failOn: parseFailOn(values['fail-on'] ?? ''),
      output: values.output ?? null,
      noColor: values['no-color'] ?? false,
    },
  };
}

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HELP_TEXT, parseCliArgs, type CliOptions } from './args.js';
import type { FetchFn } from './ecosystems.js';
import { ApiError, errorMessage, UsageError } from './errors.js';
import { formatReport } from './format/index.js';
import { failOnMessage, matchFailOn } from './report.js';
import { scan } from './scan.js';
import { VERSION } from './version.js';

export const EXIT_OK = 0;
export const EXIT_FAIL_ON = 1;
export const EXIT_USAGE = 2;
export const EXIT_API = 3;

export interface OutputStream {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

export interface CliDeps {
  fetch: FetchFn;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: OutputStream;
  stderr: OutputStream;
}

export function shouldUseColor(options: CliOptions, deps: CliDeps): boolean {
  if (options.format !== 'text' || options.noColor || options.output !== null) return false;
  if (deps.stdout.isTTY !== true) return false;
  const noColor = deps.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') return false;
  return deps.env.TERM !== 'dumb';
}

/** Runs the CLI and returns the exit code. Never throws. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  let fromArgs = true;
  try {
    const parsed = parseCliArgs(argv);
    if (parsed.kind === 'help') {
      deps.stdout.write(HELP_TEXT);
      return EXIT_OK;
    }
    if (parsed.kind === 'version') {
      deps.stdout.write(`${VERSION}\n`);
      return EXIT_OK;
    }
    fromArgs = false;
    const options = parsed.options;
    const report = await scan(
      {
        path: options.path,
        cwd: deps.cwd,
        options: { all: options.all, dev: options.dev, recursive: options.recursive },
        budget:
          options.budgetCents === null
            ? null
            : { totalCents: options.budgetCents, currency: options.currency },
      },
      { fetch: deps.fetch, sleep: deps.sleep, now: deps.now },
    );
    const output = formatReport(report, options.format, {
      color: shouldUseColor(options, deps),
    });
    if (options.output !== null) {
      try {
        await writeFile(resolve(deps.cwd, options.output), output, 'utf8');
      } catch (error) {
        throw new UsageError(`Could not write ${options.output}: ${errorMessage(error)}`);
      }
      deps.stderr.write(`Report written to ${options.output}\n`);
    } else {
      deps.stdout.write(output);
    }
    const matched = matchFailOn(report, options.failOn);
    if (matched.length > 0) {
      deps.stderr.write(`fundscan: ${failOnMessage(matched.length, options.failOn)}\n`);
      return EXIT_FAIL_ON;
    }
    return EXIT_OK;
  } catch (error) {
    if (error instanceof UsageError) {
      deps.stderr.write(`fundscan: ${error.message}\n`);
      if (fromArgs) deps.stderr.write('Run "fundscan --help" for usage.\n');
      return EXIT_USAGE;
    }
    if (error instanceof ApiError) {
      deps.stderr.write(`fundscan: ${error.message}\n`);
      return EXIT_API;
    }
    const detail = error instanceof Error && error.stack ? error.stack : String(error);
    deps.stderr.write(`fundscan: internal error: ${detail}\n`);
    return EXIT_USAGE;
  }
}

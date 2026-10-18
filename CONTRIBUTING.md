# Contributing to fundscan

Thanks for contributing. Please be respectful in issues, reviews and code.

## Setup

You need Node.js 24 (see `.nvmrc`).

```bash
npm ci
npm run all
```

`npm run all` runs the format check, lint, type check, tests and build, which is the same as CI.

| Script                    | What it does                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| `npm test`                | Runs the unit tests with Vitest. They never use the network.         |
| `npm run lint`            | Runs ESLint.                                                         |
| `npm run format`          | Formats everything with Prettier.                                    |
| `npm run typecheck`       | Type-checks with `tsc` (no output files).                            |
| `npm run build`           | Bundles the Action into `dist/` and the CLI into `lib/`.             |
| `npm run demo`            | Runs the CLI offline against `examples/demo` with recorded API data. |
| `npm run record-fixtures` | Re-records the demo API data from ecosyste.ms (needs network).       |

## Committing `dist/`

GitHub runs the bundled `dist/index.js`, so it is committed. After changing anything in `src/`,
run `npm run build` and commit `dist/` together with your change. CI fails if `dist/` is out
of date. `lib/` is the npm package bundle; it is built by `npm pack` and is not committed.

## How the code is organised

- `src/cli.ts` and `src/action.ts`: entry points that wire up the network, files and output.
- `src/cli-main.ts` and `src/action-main.ts`: testable runners that take their dependencies as
  arguments.
- `src/collect.ts` and `src/parsers/`: finding and parsing dependency files.
- `src/ecosystems.ts`: the only code that talks to the ecosyste.ms API.
- `src/funding.ts`, `src/health.ts`, `src/budget.ts` and `src/report.ts`: building the report.
- `src/format/`: text, Markdown and JSON output.

## Changing the demo

The example output in `README.md` must match `npm run demo` exactly, and a test checks this. If
you change the output format or re-record the fixtures, paste the new demo output into the
README.

## Pull requests

Fill in the PR template, link the issue you are fixing, and include tests.

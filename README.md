# fundscan

**See who to fund and which dependencies are at risk, across npm, PyPI, Cargo and Go.**

fundscan reads the dependency files in your project and answers two questions:

1. **Who should I fund?** It lists the funding destinations of your dependencies (GitHub
   Sponsors, Open Collective, Patreon, Ko-fi, Liberapay, Tidelift, thanks.dev, Polar, Buy Me a
   Coffee and project donation pages), ranked by how many of your dependencies each one covers.
   With `--budget` it suggests how to split an amount so that each funded dependency gets an
   equal share.
2. **Which dependencies are at risk?** It flags dependencies that are deprecated, archived,
   stale, mostly written by one person, or unknown to the registry.

It runs as a CLI or as a GitHub Action, gives the same answer for the same data, and reads your
files locally. Only package names are sent to the public [ecosyste.ms](https://ecosyste.ms) API.

## Usage

```bash
npx fundscan                      # scan the current directory
npx fundscan path/to/project --budget 100
npx fundscan --all --dev --format markdown --output fundscan.md
npx fundscan --fail-on deprecated,archived   # exit code 1 if anything matches
```

Requires Node.js 22 or later.

## Example output

`npx fundscan examples/demo --budget 100` for the project in [`examples/demo`](examples/demo).
The output below comes from `npm run demo`, which runs the same code offline against API
responses recorded in October 2026:

```text
fundscan 0.1.0
Scanned examples/demo: Cargo.toml, go.mod, package.json, requirements.txt
20 dependencies: npm 6, PyPI 6, Cargo 5, Go 3

Who to fund
  12 of 20 dependencies list funding, through 20 destinations.

   #  Deps  Platform         Destination                               Covers
   1     4  Tidelift         https://tidelift.com                      commander, yaml, attrs, click
   2     3  GitHub Sponsors  https://github.com/sponsors/dtolnay       anyhow, serde, thiserror
   3     1  GitHub Sponsors  https://github.com/sponsors/abetomo       commander
   4     1  GitHub Sponsors  https://github.com/sponsors/clap-rs       clap
   5     1  GitHub Sponsors  https://github.com/sponsors/eemeli        yaml
   6     1  GitHub Sponsors  https://github.com/sponsors/hynek         attrs
   7     1  GitHub Sponsors  https://github.com/sponsors/pallets       click
   8     1  GitHub Sponsors  https://github.com/sponsors/psf           requests
   9     1  GitHub Sponsors  https://github.com/sponsors/Qix-          chalk
  10     1  GitHub Sponsors  https://github.com/sponsors/shadowspawn   commander
  11     1  GitHub Sponsors  https://github.com/sponsors/sindresorhus  chalk
  12     1  GitHub Sponsors  https://github.com/sponsors/tj            commander
  13     1  GitHub Sponsors  https://github.com/sponsors/willmcgugan   rich
  14     1  Open Collective  https://opencollective.com/clap           clap
  15     1  Open Collective  https://opencollective.com/express        express
  16     1  thanks.dev       https://thanks.dev/u/gh/pallets           click
  17     1  thanks.dev       https://thanks.dev/u/gh/python-attrs      attrs
  18     1  Other            https://hynek.me/say-thanks               attrs
  19     1  Other            https://palletsprojects.com/donate        click
  20     1  Other            https://www.python.org/psf/sponsorship    requests

  No funding listed: left-pad, request, nose, lazy_static, github.com/mitchellh/mapstructure, github.com/pkg/errors, github.com/spf13/cobra

Suggested split of 100.00 USD
  Amount  Destination
   10.42  https://tidelift.com
   25.00  https://github.com/sponsors/dtolnay
    2.09  https://github.com/sponsors/abetomo
    4.17  https://github.com/sponsors/clap-rs
    4.17  https://github.com/sponsors/eemeli
    2.08  https://github.com/sponsors/hynek
    2.08  https://github.com/sponsors/pallets
    4.17  https://github.com/sponsors/psf
    4.17  https://github.com/sponsors/Qix-
    2.08  https://github.com/sponsors/shadowspawn
    4.17  https://github.com/sponsors/sindresorhus
    2.08  https://github.com/sponsors/tj
    8.33  https://github.com/sponsors/willmcgugan
    4.17  https://opencollective.com/clap
    8.33  https://opencollective.com/express
    2.08  https://thanks.dev/u/gh/pallets
    2.08  https://thanks.dev/u/gh/python-attrs
    2.08  https://hynek.me/say-thanks
    2.08  https://palletsprojects.com/donate
    4.17  https://www.python.org/psf/sponsorship

Dependencies at risk
  9 of 20 dependencies are flagged.

  Package                            Ecosystem  Flags                        Details
  left-pad                           npm        deprecated, archived, stale  status: deprecated; repository archived; no release or push since 2019-04-19
  request                            npm        deprecated, stale            status: deprecated; no release or push since 2024-08-14
  yaml                               npm        concentrated                 top committer wrote 96% of 1448 commits
  acme-internal-billing              PyPI       unknown                      not found on ecosyste.ms
  nose                               PyPI       stale                        no release or push since 2023-11-06
  anyhow                             Cargo      concentrated                 top committer wrote 95% of 684 commits
  lazy_static                        Cargo      archived                     repository archived
  thiserror                          Cargo      concentrated                 top committer wrote 95% of 589 commits
  github.com/mitchellh/mapstructure  Go         archived, stale              repository archived; no release or push since 2024-06-25

Warnings
  - requirements.txt: skipped "-e ./tools/local-lib" (editable installs are not looked up)

Data from packages.ecosyste.ms
```

## Options

| Option                | Description                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `[path]`              | Project directory to scan. Defaults to the current directory.                                                            |
| `--format <format>`   | `text` (default), `markdown` or `json`.                                                                                  |
| `--all`               | Include transitive dependencies from lockfiles and `// indirect` Go modules.                                             |
| `--dev`               | Include development dependencies.                                                                                        |
| `--recursive`         | Also scan subdirectories. Skips hidden directories, `node_modules`, `vendor`, `target`, `dist` and `build`.              |
| `--budget <amount>`   | Suggest how to split this amount across the funding destinations.                                                        |
| `--currency <code>`   | Currency label for `--budget`. Defaults to `USD`.                                                                        |
| `--fail-on <flags>`   | Comma-separated flags that make fundscan exit with code 1: `deprecated`, `archived`, `stale`, `concentrated`, `unknown`. |
| `-o, --output <file>` | Write the report to a file instead of standard output.                                                                   |
| `--no-color`          | Disable colors. Colors are also off when the output is not a terminal or `NO_COLOR` is set.                              |
| `-h, --help`          | Show help.                                                                                                               |
| `-v, --version`       | Show the version.                                                                                                        |

Exit codes: `0` success, `1` a dependency matched `--fail-on`, `2` invalid arguments or an
unreadable file, `3` the ecosyste.ms API could not be reached or returned an error.

## Supported files

| Ecosystem | Direct dependencies                                                        | With `--all`                          |
| --------- | -------------------------------------------------------------------------- | ------------------------------------- |
| npm       | `package.json` (`dependencies`, `optionalDependencies`, `devDependencies`) | `package-lock.json` (v2 and v3)       |
| PyPI      | `requirements*.txt`, `pyproject.toml` (PEP 621, dependency groups, Poetry) | `poetry.lock`, `uv.lock`              |
| Cargo     | `Cargo.toml` (including target-specific and workspace dependencies)        | `Cargo.lock`                          |
| Go        | `go.mod`                                                                   | `go.mod` modules marked `// indirect` |

Development dependencies are `devDependencies`, `[dev-dependencies]`, Poetry groups, PEP 735
dependency groups, `[project.optional-dependencies]` and files such as `requirements-dev.txt`.
Local, Git and URL dependencies are skipped; the report lists them under "Warnings". PyPI
names are normalized as described in PEP 503.

## Health flags

| Flag           | Meaning                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| `deprecated`   | The registry marks the package as deprecated (or removed, unpublished or yanked).          |
| `archived`     | The source repository is archived.                                                         |
| `stale`        | No release and no push to the repository in the last two years (730 days).                 |
| `concentrated` | One person wrote at least 90% of the commits (repositories with at least 20 commits).      |
| `unknown`      | ecosyste.ms has no record of the package, for example because it is private or misspelled. |

## GitHub Action

```yaml
name: Dependency funding

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'

permissions:
  contents: read

jobs:
  fundscan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: MAcemek/fundscan@v0
        with:
          budget: 100
          fail-on: deprecated,archived
```

The Action writes the Markdown report to the job summary and the text report to the log. It
needs no token.

### Inputs

| Input       | Default | Description                                                                 |
| ----------- | ------- | --------------------------------------------------------------------------- |
| `path`      | `.`     | Directory to scan, relative to the workspace.                               |
| `all`       | `false` | Include transitive dependencies from lockfiles.                             |
| `dev`       | `false` | Include development dependencies.                                           |
| `recursive` | `false` | Also scan subdirectories.                                                   |
| `budget`    | `''`    | Suggest how to split this amount across funding destinations.               |
| `currency`  | `USD`   | Currency label for `budget`.                                                |
| `fail-on`   | `''`    | Comma-separated flags that fail the run, for example `deprecated,archived`. |

### Outputs

| Output                 | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `dependency-count`     | Number of dependencies scanned.                                     |
| `flagged-count`        | Number of dependencies with at least one health flag.               |
| `destination-count`    | Number of funding destinations found.                               |
| `funding-destinations` | JSON array of destination URLs, the one covering the most first.    |
| `report-json`          | Path to the full JSON report (`$RUNNER_TEMP/fundscan-report.json`). |

## How it works

1. fundscan finds the supported files in the directory, parses them locally and merges
   duplicates by ecosystem and name.
2. It sends the package names to the
   [ecosyste.ms Packages API](https://packages.ecosyste.ms/docs) with
   `POST /api/v1/packages/bulk_lookup`, 100 packages per request. No API key is needed. The
   anonymous limit is 5000 requests per hour, so a project with 1000 dependencies uses 10.
3. Funding links come from the `funding_links` field, which ecosyste.ms collects from registry
   metadata and `FUNDING.yml` files. Links to the same account are grouped, and all Tidelift
   links count as one destination.
4. Health flags use the package `status`, the repository's `archived` and `pushed_at` fields, the
   latest release date and the repository's commit statistics.
5. For the budget split, every dependency that lists funding gets an equal share, divided
   equally between its own destinations. A destination receives the sum of its shares, so a
   project does not get more money by listing more links. Amounts are rounded to cents with the
   largest remainder method, so the parts always add up to the budget.

Thanks to [ecosyste.ms](https://ecosyste.ms) for providing open data about open source
packages.

## Comparison

- [`npm fund`](https://docs.npmjs.com/cli/commands/npm-fund) lists funding links for npm
  packages only and does not rank them or check health.
- GitHub's sponsor-finder is an AI agent skill, not a deterministic tool you can run in CI.
- [lockrot](https://github.com/somework/lockrot) (Composer) and Vigil (PyPI) look for
  abandoned packages in a single ecosystem and do not cover funding.

fundscan covers four ecosystems, works the same locally and in CI, and does not upload your
code.

## FAQ

**Is my code uploaded anywhere?**
No. Files are read on your machine. The only network traffic is the list of package URLs
(for example `pkg:npm/express`) sent to ecosyste.ms.

**Why is a dependency marked unknown?**
ecosyste.ms has no record of it. This is expected for private packages and packages from
other registries.

**Why does the funding list differ from `npm fund`?**
ecosyste.ms also reads `FUNDING.yml` files from repositories, so it often finds more links.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

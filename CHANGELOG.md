# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-18

### Added

- First release of fundscan, a CLI (`npx fundscan`) and GitHub Action.
- Reads `package.json`, `package-lock.json`, `requirements*.txt`, `pyproject.toml`, `poetry.lock`,
  `uv.lock`, `Cargo.toml`, `Cargo.lock` and `go.mod`.
- Funding destinations grouped by account and ranked by the number of dependencies they cover.
- `--budget` and `--currency` to suggest a split that gives every funded dependency an equal share
  and adds up exactly to the budget.
- Health flags: `deprecated`, `archived`, `stale`, `concentrated` and `unknown`.
- `--fail-on` for CI, text, Markdown and JSON output, `--all`, `--dev`, `--recursive` and
  `--output`.
- Package data from the ecosyste.ms bulk lookup API, with retries and rate limit handling.
- Offline `npm run demo` against recorded API data.

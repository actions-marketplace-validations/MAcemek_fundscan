#!/usr/bin/env node
import { runCli } from './cli-main.js';

process.exitCode = await runCli(process.argv.slice(2), {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});

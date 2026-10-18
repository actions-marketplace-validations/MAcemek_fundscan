/**
 * Runs the fundscan CLI offline against examples/demo, using recorded ecosyste.ms data.
 *
 *   npm run demo
 *   npm run demo -- --format markdown
 *   npm run demo -- --all --dev
 *
 * Nothing is sent over the network. The example output in README.md is this script's output.
 */
import { runDemo } from '../test/helpers/demo.js';

process.exitCode = await runDemo(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
});

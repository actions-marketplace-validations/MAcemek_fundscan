import { runCli, type CliDeps } from '../../src/cli-main.js';
import { createFixtureFetch, loadFixture } from './fixture-fetch.js';

export const DEMO_FIXTURE = 'test/fixtures/api/demo.json';
export const DEMO_ARGS = ['examples/demo', '--budget', '100'];

/** Runs the real CLI against examples/demo with recorded API data. Must run from the repo root. */
export async function runDemo(
  extraArgs: string[],
  io: Pick<CliDeps, 'stdout' | 'stderr' | 'env'>,
): Promise<number> {
  const fixture = loadFixture(DEMO_FIXTURE);
  return runCli([...DEMO_ARGS, ...extraArgs], {
    fetch: createFixtureFetch(fixture),
    sleep: async () => undefined,
    now: () => new Date(fixture.recordedAt),
    cwd: process.cwd(),
    ...io,
  });
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runDemo } from './helpers/demo.js';

function firstTextBlock(markdown: string): string {
  const match = /```text\n([\s\S]*?)```/.exec(markdown);
  if (!match?.[1]) throw new Error('README.md has no ```text block');
  return match[1];
}

describe('README', () => {
  it('shows the exact output of npm run demo', async () => {
    let stdout = '';
    const code = await runDemo([], {
      stdout: { write: (chunk: string) => (stdout += chunk) },
      stderr: { write: () => true },
      env: {},
    });
    expect(code).toBe(0);
    expect(firstTextBlock(readFileSync('README.md', 'utf8'))).toBe(stdout);
  });
});

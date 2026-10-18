import { describe, expect, it } from 'vitest';
import { parseCliArgs, parseCurrency, parseFailOn } from '../src/args.js';
import { UsageError } from '../src/errors.js';

describe('parseCliArgs', () => {
  it('uses defaults', () => {
    expect(parseCliArgs([])).toEqual({
      kind: 'run',
      options: {
        path: '.',
        format: 'text',
        all: false,
        dev: false,
        recursive: false,
        budgetCents: null,
        currency: 'USD',
        failOn: [],
        output: null,
        noColor: false,
      },
    });
  });

  it('reads every option', () => {
    expect(
      parseCliArgs([
        'some/dir',
        '--format',
        'json',
        '--all',
        '--dev',
        '--recursive',
        '--budget',
        '250.5',
        '--currency',
        'EUR',
        '--fail-on',
        'deprecated, archived',
        '-o',
        'out.json',
        '--no-color',
      ]),
    ).toEqual({
      kind: 'run',
      options: {
        path: 'some/dir',
        format: 'json',
        all: true,
        dev: true,
        recursive: true,
        budgetCents: 25_050,
        currency: 'EUR',
        failOn: ['deprecated', 'archived'],
        output: 'out.json',
        noColor: true,
      },
    });
  });

  it('accepts --option=value', () => {
    const parsed = parseCliArgs(['--format=markdown', '--output=report.md']);
    expect(parsed.kind === 'run' && parsed.options.format).toBe('markdown');
    expect(parsed.kind === 'run' && parsed.options.output).toBe('report.md');
  });

  it('handles help and version first', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['-h', '--format', 'nope'])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['-v'])).toEqual({ kind: 'version' });
  });

  it.each([
    [['--format', 'xml'], 'Unknown format "xml". Use text, markdown or json.'],
    [['a', 'b'], 'Expected at most one path, got 2.'],
    [
      ['--fail-on', 'old'],
      'Unknown fail-on value "old". Use deprecated, archived, stale, concentrated, unknown.',
    ],
    [
      ['--budget', 'ten'],
      'Invalid budget "ten". Use a positive amount with up to two decimals, for example 100 or 49.99.',
    ],
    [['--output', ''], '--output needs a file name.'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(message);
  });

  it('turns parseArgs errors into usage errors', () => {
    expect(() => parseCliArgs(['--nope'])).toThrow(UsageError);
    expect(() => parseCliArgs(['--format'])).toThrow(UsageError);
  });
});

describe('parseFailOn', () => {
  it('parses, lowercases and dedupes', () => {
    expect(parseFailOn('')).toEqual([]);
    expect(parseFailOn(' Stale ,stale,,unknown ')).toEqual(['stale', 'unknown']);
  });
});

describe('parseCurrency', () => {
  it('accepts short labels', () => {
    expect(parseCurrency(' EUR ')).toBe('EUR');
    expect(() => parseCurrency('US Dollar')).toThrow(UsageError);
    expect(() => parseCurrency('')).toThrow(UsageError);
  });
});

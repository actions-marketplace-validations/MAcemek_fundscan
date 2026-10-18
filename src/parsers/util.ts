import { parse as parseToml } from 'smol-toml';
import { errorMessage, UsageError } from '../errors.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonFile(content: string, file: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(stripBom(content));
  } catch (error) {
    throw new UsageError(`Could not parse ${file}: ${errorMessage(error)}`);
  }
  if (!isRecord(value)) {
    throw new UsageError(`Could not parse ${file}: expected a JSON object`);
  }
  return value;
}

export function parseTomlFile(content: string, file: string): Record<string, unknown> {
  try {
    return parseToml(stripBom(content));
  } catch (error) {
    const firstLine = errorMessage(error).split('\n')[0] ?? '';
    throw new UsageError(`Could not parse ${file}: ${firstLine}`);
  }
}

export function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function splitLines(content: string): string[] {
  return stripBom(content).split(/\r?\n/);
}

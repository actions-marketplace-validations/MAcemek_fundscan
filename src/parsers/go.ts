import type { ParsedFile } from '../types.js';
import { splitLines } from './util.js';

const OTHER_BLOCK = /^(replace|exclude|retract|tool|godebug|ignore)\s*\($/;

function unquote(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith('`'))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseGoMod(content: string): ParsedFile {
  const out: ParsedFile = { dependencies: [], warnings: [] };
  let block: 'none' | 'require' | 'other' = 'none';
  for (const line of splitLines(content)) {
    const commentIndex = line.indexOf('//');
    const comment = commentIndex === -1 ? '' : line.slice(commentIndex);
    const code = (commentIndex === -1 ? line : line.slice(0, commentIndex)).trim();
    if (code === '') continue;
    let requirement: string | null = null;
    if (block === 'require') {
      if (code === ')') block = 'none';
      else requirement = code;
    } else if (block === 'other') {
      if (code === ')') block = 'none';
    } else if (/^require\s*\($/.test(code)) {
      block = 'require';
    } else if (OTHER_BLOCK.test(code)) {
      block = 'other';
    } else if (/^require\s+/.test(code)) {
      requirement = code.replace(/^require\s+/, '');
    }
    if (requirement === null) continue;
    const path = unquote(requirement.split(/\s+/)[0] ?? '');
    if (path === '') continue;
    const indirect = /^\/\/\s*indirect\b/.test(comment);
    out.dependencies.push({ ecosystem: 'go', name: path, direct: !indirect, dev: false });
  }
  return out;
}

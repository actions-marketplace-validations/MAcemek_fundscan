/** Invalid arguments or an unreadable or unparsable input file. Exit code 2. */
export class UsageError extends Error {
  override name = 'UsageError';
}

/** The ecosyste.ms API could not be reached or returned an error. Exit code 3. */
export class ApiError extends Error {
  override name = 'ApiError';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

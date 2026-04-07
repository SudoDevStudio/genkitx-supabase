import type {
  NormalizedSupabaseVectorStoreConfig,
  SupabaseErrorLike,
} from './types.js';

interface SupabaseVectorStoreErrorOptions {
  cause?: unknown;
  code?: string;
  indexName?: string;
}

export class SupabaseVectorStoreError extends Error {
  readonly code?: string;
  readonly indexName?: string;

  constructor(
    message: string,
    options: SupabaseVectorStoreErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'SupabaseVectorStoreError';
    this.code = options.code;
    this.indexName = options.indexName;
  }
}

export function createValidationError(
  message: string,
  indexName?: string
): SupabaseVectorStoreError {
  return new SupabaseVectorStoreError(message, {
    code: 'INVALID_ARGUMENT',
    indexName,
  });
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown error';
}

export function describeSupabaseError(error: SupabaseErrorLike): string {
  const parts = [error.message];

  if (error.code) {
    parts.push(`code ${error.code}`);
  }

  if (error.details) {
    parts.push(error.details);
  }

  if (error.hint) {
    parts.push(`hint: ${error.hint}`);
  }

  return parts.join(' | ');
}

export function formatRelation(
  config: NormalizedSupabaseVectorStoreConfig
): string {
  return `${config.schema}.${config.table}`;
}

export function formatRpcTarget(
  config: NormalizedSupabaseVectorStoreConfig
): string {
  return `${config.schema}.${config.queryRpcName}`;
}

export function wrapSupabaseFailure(
  config: NormalizedSupabaseVectorStoreConfig,
  action: string,
  error: SupabaseErrorLike,
  hint: string
): SupabaseVectorStoreError {
  return new SupabaseVectorStoreError(
    `${action} failed for index "${config.indexName}". ${hint} Supabase returned: ${describeSupabaseError(error)}`,
    {
      cause: error,
      code: error.code,
      indexName: config.indexName,
    }
  );
}

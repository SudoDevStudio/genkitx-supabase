import { createValidationError } from './errors.js';
import type { SupabaseJson, SupabaseMetadataFilter } from './types.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function normalizeJsonValue(
  value: unknown,
  context: string
): SupabaseJson {
  if (value === null) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw createValidationError(
        `${context} contains a non-finite number, which cannot be stored as JSONB.`
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeJsonValue(item, `${context}[${index}]`)
    );
  }

  if (!isPlainObject(value)) {
    throw createValidationError(
      `${context} must be plain JSON data. Received ${Object.prototype.toString.call(value)}.`
    );
  }

  const output: Record<string, SupabaseJson> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined) {
      throw createValidationError(
        `${context}.${key} is undefined. JSONB metadata and filters cannot contain undefined values.`
      );
    }

    output[key] = normalizeJsonValue(nestedValue, `${context}.${key}`);
  }

  return output;
}

export function normalizeJsonObject(
  value: unknown,
  context: string
): Record<string, SupabaseJson> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw createValidationError(`${context} must be a JSON object.`);
  }

  return normalizeJsonValue(
    value,
    context
  ) as Record<string, SupabaseJson>;
}

export function normalizeMetadataFilter(
  filter: unknown
): SupabaseMetadataFilter | undefined {
  return normalizeJsonObject(filter, 'Retriever metadata filter');
}

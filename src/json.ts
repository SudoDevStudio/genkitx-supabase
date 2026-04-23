import { createValidationError } from './errors.js';
import type {
  SupabaseJson,
  SupabaseMetadataComparisonValue,
  SupabaseMetadataFilter,
  SupabaseMetadataFilterNode,
  SupabaseMetadataFilterOperators,
} from './types.js';

const FILTER_OPERATOR_KEYS = new Set([
  '$contains',
  '$eq',
  '$exists',
  '$gt',
  '$gte',
  '$in',
  '$lt',
  '$lte',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function hasOperatorKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => key.startsWith('$'));
}

function isMetadataFilterOperators(
  value: SupabaseMetadataFilterNode
): value is SupabaseMetadataFilterOperators {
  return (
    isPlainObject(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every((key) => FILTER_OPERATOR_KEYS.has(key))
  );
}

function normalizeComparisonValue(
  value: unknown,
  context: string
): SupabaseMetadataComparisonValue {
  if (isPlainObject(value) && hasOperatorKeys(value)) {
    throw createValidationError(
      `${context} must be plain JSON data. Operator objects are only allowed directly on metadata fields.`
    );
  }

  return normalizeJsonValue(value, context) as SupabaseMetadataComparisonValue;
}

function normalizeComparisonOperand(
  value: unknown,
  context: string
): number | string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createValidationError(`${context} must be a finite number.`);
    }

    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw createValidationError(`${context} must be a string or a finite number.`);
}

function normalizeOperatorObject(
  value: Record<string, unknown>,
  context: string
): SupabaseMetadataFilterOperators {
  const keys = Object.keys(value);

  if (keys.length === 0) {
    throw createValidationError(`${context} must not be empty.`);
  }

  const output: SupabaseMetadataFilterOperators = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (!FILTER_OPERATOR_KEYS.has(key)) {
      throw createValidationError(
        `${context}.${key} is not a supported filter operator. Supported operators are ${[
          ...FILTER_OPERATOR_KEYS,
        ].join(', ')}.`
      );
    }

    switch (key) {
      case '$contains':
      case '$eq':
        output[key] = normalizeComparisonValue(nestedValue, `${context}.${key}`);
        break;
      case '$exists':
        if (typeof nestedValue !== 'boolean') {
          throw createValidationError(`${context}.${key} must be a boolean.`);
        }

        output.$exists = nestedValue;
        break;
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
        output[key] = normalizeComparisonOperand(nestedValue, `${context}.${key}`);
        break;
      case '$in':
        if (!Array.isArray(nestedValue) || nestedValue.length === 0) {
          throw createValidationError(
            `${context}.${key} must be a non-empty array.`
          );
        }

        output.$in = nestedValue.map((item, index) =>
          normalizeComparisonValue(item, `${context}.${key}[${index}]`)
        );
        break;
      default:
        break;
    }
  }

  return output;
}

function normalizeMetadataFilterNode(
  value: unknown,
  context: string
): SupabaseMetadataFilterNode {
  if (!isPlainObject(value)) {
    return normalizeComparisonValue(value, context);
  }

  if (hasOperatorKeys(value)) {
    const hasNonOperatorKeys = Object.keys(value).some(
      (key) => !FILTER_OPERATOR_KEYS.has(key)
    );

    if (hasNonOperatorKeys) {
      throw createValidationError(
        `${context} cannot mix filter operators with nested metadata fields.`
      );
    }

    return normalizeOperatorObject(value, context);
  }

  const output: SupabaseMetadataFilter = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined) {
      throw createValidationError(
        `${context}.${key} is undefined. JSONB metadata and filters cannot contain undefined values.`
      );
    }

    output[key] = normalizeMetadataFilterNode(nestedValue, `${context}.${key}`);
  }

  return output;
}

function compareJsonValues(
  candidate: unknown,
  expected: SupabaseMetadataComparisonValue
): boolean {
  if (candidate === expected) {
    return true;
  }

  if (candidate === null || expected === null) {
    return candidate === expected;
  }

  if (Array.isArray(candidate) && Array.isArray(expected)) {
    return (
      candidate.length === expected.length &&
      expected.every((value, index) => compareJsonValues(candidate[index], value))
    );
  }

  if (!isPlainObject(candidate) || !isPlainObject(expected)) {
    return false;
  }

  const candidateKeys = Object.keys(candidate);
  const expectedKeys = Object.keys(expected);

  return (
    candidateKeys.length === expectedKeys.length &&
    expectedKeys.every(
      (key) =>
        key in candidate &&
        compareJsonValues(
          (candidate as Record<string, unknown>)[key],
          expected[key] as SupabaseMetadataComparisonValue
        )
    )
  );
}

function containsJsonValue(
  candidate: unknown,
  expected: SupabaseMetadataComparisonValue
): boolean {
  if (Array.isArray(candidate)) {
    if (Array.isArray(expected)) {
      return expected.every((item) =>
        candidate.some((candidateItem) => compareJsonValues(candidateItem, item))
      );
    }

    return candidate.some((item) => compareJsonValues(item, expected));
  }

  if (!isPlainObject(candidate) || !isPlainObject(expected)) {
    return false;
  }

  return Object.entries(expected).every(([key, value]) => {
    if (!(key in candidate)) {
      return false;
    }

    const candidateValue = candidate[key];

    if (Array.isArray(value) || isPlainObject(value)) {
      return containsJsonValue(candidateValue, value);
    }

    return compareJsonValues(candidateValue, value);
  });
}

function compareRangeValue(
  candidate: unknown,
  expected: number | string,
  operator: '$gt' | '$gte' | '$lt' | '$lte'
): boolean {
  if (typeof candidate !== typeof expected) {
    return false;
  }

  if (typeof candidate !== 'number' && typeof candidate !== 'string') {
    return false;
  }

  switch (operator) {
    case '$gt':
      return candidate > expected;
    case '$gte':
      return candidate >= expected;
    case '$lt':
      return candidate < expected;
    case '$lte':
      return candidate <= expected;
  }

  return false;
}

function matchesOperatorFilter(
  candidate: unknown,
  filter: SupabaseMetadataFilterOperators
): boolean {
  if (filter.$exists !== undefined) {
    const exists = candidate !== undefined;

    if (filter.$exists !== exists) {
      return false;
    }

    if (!exists) {
      return Object.keys(filter).length === 1;
    }
  }

  if (candidate === undefined) {
    return false;
  }

  if (
    filter.$eq !== undefined &&
    !compareJsonValues(candidate, filter.$eq)
  ) {
    return false;
  }

  if (
    filter.$in !== undefined &&
    !filter.$in.some((value) => compareJsonValues(candidate, value))
  ) {
    return false;
  }

  if (
    filter.$contains !== undefined &&
    !containsJsonValue(candidate, filter.$contains)
  ) {
    return false;
  }

  if (
    filter.$gt !== undefined &&
    !compareRangeValue(candidate, filter.$gt, '$gt')
  ) {
    return false;
  }

  if (
    filter.$gte !== undefined &&
    !compareRangeValue(candidate, filter.$gte, '$gte')
  ) {
    return false;
  }

  if (
    filter.$lt !== undefined &&
    !compareRangeValue(candidate, filter.$lt, '$lt')
  ) {
    return false;
  }

  if (
    filter.$lte !== undefined &&
    !compareRangeValue(candidate, filter.$lte, '$lte')
  ) {
    return false;
  }

  return true;
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
  if (filter === null || filter === undefined) {
    return undefined;
  }

  if (!isPlainObject(filter)) {
    throw createValidationError('Retriever metadata filter must be a JSON object.');
  }

  if (hasOperatorKeys(filter)) {
    throw createValidationError(
      'Retriever metadata filter must target metadata fields at the top level.'
    );
  }

  return normalizeMetadataFilterNode(
    filter,
    'Retriever metadata filter'
  ) as SupabaseMetadataFilter;
}

export function matchesMetadataFilter(
  metadata: Record<string, SupabaseJson> | undefined,
  filter: SupabaseMetadataFilter | undefined
): boolean {
  if (!filter) {
    return true;
  }

  const candidateMetadata = metadata ?? {};

  return Object.entries(filter).every(([key, value]) => {
    const candidate = candidateMetadata[key];

    if (isMetadataFilterOperators(value)) {
      return matchesOperatorFilter(candidate, value);
    }

    if (isPlainObject(value) && !Array.isArray(value)) {
      return (
        isPlainObject(candidate) &&
        matchesMetadataFilter(
          candidate as Record<string, SupabaseJson>,
          value as SupabaseMetadataFilter
        )
      );
    }

    return compareJsonValues(candidate, value);
  });
}

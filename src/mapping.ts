import { randomUUID } from 'node:crypto';

import { type DocumentData } from 'genkit/retriever';

import { createValidationError } from './errors.js';
import { normalizeJsonObject, normalizeJsonValue, normalizeMetadataFilter } from './json.js';
import type {
  NormalizedSupabaseVectorStoreConfig,
  PreparedDocument,
  SupabaseDocumentId,
  SupabaseMatchRpcPayload,
} from './types.js';

export function normalizeDocumentId(
  id: SupabaseDocumentId,
  context: string
): string {
  if (typeof id === 'string') {
    const trimmed = id.trim();

    if (!trimmed) {
      throw createValidationError(`${context} must not be empty.`);
    }

    return trimmed;
  }

  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(id);
  }

  throw createValidationError(
    `${context} must be a non-empty string or a finite number.`
  );
}

export function extractDocumentText(
  document: DocumentData,
  context: string
): string {
  const text = document.content
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw createValidationError(
      `${context} does not contain any text content. @sudodevstudio/genkitx-supabase v1 supports text documents only.`
    );
  }

  return text;
}

export function prepareDocumentForIndexing(
  document: DocumentData,
  position: number,
  indexName: string
): PreparedDocument {
  const context = `Document ${position + 1} for index "${indexName}"`;
  const metadata = normalizeJsonObject(document.metadata, `${context} metadata`) ?? {};
  const existingId = metadata.id;
  const id =
    existingId === undefined
      ? randomUUID()
      : normalizeDocumentId(existingId as SupabaseDocumentId, `${context} metadata.id`);

  return {
    id,
    content: extractDocumentText(document, context),
    metadata: {
      ...metadata,
      id,
    },
  };
}

export function normalizeEmbeddingVector(
  embedding: unknown,
  context: string,
  expectedDimension?: number
): number[] {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw createValidationError(`${context} must be a non-empty number array.`);
  }

  const normalized = embedding.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw createValidationError(
        `${context}[${index}] must be a finite number.`
      );
    }

    return value;
  });

  if (expectedDimension && normalized.length !== expectedDimension) {
    throw createValidationError(
      `${context} has dimension ${normalized.length}, but the configured embeddingDimension is ${expectedDimension}.`
    );
  }

  return normalized;
}

export function buildUpsertRow(
  document: PreparedDocument,
  embedding: number[],
  config: NormalizedSupabaseVectorStoreConfig
): Record<string, unknown> {
  return {
    [config.idColumn]: document.id,
    [config.contentColumn]: document.content,
    [config.metadataColumn]: document.metadata,
    [config.embeddingColumn]: embedding,
  };
}

export function buildMatchRpcPayload(params: {
  queryEmbedding: number[];
  k: number;
  filter?: unknown;
}): SupabaseMatchRpcPayload {
  if (!Number.isInteger(params.k) || params.k <= 0) {
    throw createValidationError(
      'Retriever option "k" must be a positive integer.'
    );
  }

  return {
    query_embedding: normalizeEmbeddingVector(
      params.queryEmbedding,
      'Retriever query embedding'
    ),
    match_count: params.k,
    filter: normalizeMetadataFilter(params.filter) ?? null,
  };
}

export function rowToDocumentData(
  row: Record<string, unknown>,
  config: NormalizedSupabaseVectorStoreConfig
): DocumentData {
  const contentValue = row[config.contentColumn];

  if (typeof contentValue !== 'string' || !contentValue.trim()) {
    throw createValidationError(
      `Retrieved row for index "${config.indexName}" is missing a non-empty "${config.contentColumn}" value.`,
      config.indexName
    );
  }

  const id = normalizeDocumentId(
    row[config.idColumn] as SupabaseDocumentId,
    `Retrieved row "${config.idColumn}"`
  );
  const metadata =
    normalizeJsonObject(
      row[config.metadataColumn],
      `Retrieved row "${config.metadataColumn}"`
    ) ?? {};
  const extraMetadata: Record<string, ReturnType<typeof normalizeJsonValue>> = {};

  for (const [key, value] of Object.entries(row)) {
    if (
      key === config.idColumn ||
      key === config.contentColumn ||
      key === config.metadataColumn ||
      key === config.embeddingColumn ||
      value === undefined
    ) {
      continue;
    }

    extraMetadata[key] = normalizeJsonValue(value, `Retrieved row "${key}"`);
  }

  return {
    content: [{ text: contentValue }],
    metadata: {
      ...extraMetadata,
      ...metadata,
      id,
    },
  };
}

export function resolveDeleteIds(
  documents: readonly DocumentData[],
  ids: readonly SupabaseDocumentId[] | undefined,
  indexName: string
): string[] {
  if (ids?.length) {
    return [...new Set(ids.map((id) => normalizeDocumentId(id, 'Delete ids')))];
  }

  const extracted = documents.map((document, index) => {
    const documentId = document.metadata?.id;

    if (documentId === undefined) {
      throw createValidationError(
        `Delete operation for index "${indexName}" requires "options.ids" or document metadata.id. Document ${index + 1} is missing metadata.id.`,
        indexName
      );
    }

    return normalizeDocumentId(
      documentId as SupabaseDocumentId,
      `Document ${index + 1} metadata.id`
    );
  });

  return [...new Set(extracted)];
}

import { z } from 'genkit';

import {
  DEFAULT_CONTENT_COLUMN,
  DEFAULT_EMBEDDING_COLUMN,
  DEFAULT_ID_COLUMN,
  DEFAULT_METADATA_COLUMN,
  DEFAULT_QUERY_RPC_NAME,
  DEFAULT_SCHEMA,
  DEFAULT_TABLE,
  DEFAULT_TOP_K,
  INDEX_NAME_PATTERN,
  PG_IDENTIFIER_PATTERN,
} from './constants.js';
import { createValidationError } from './errors.js';
import type {
  NormalizedSupabaseVectorStoreConfig,
  SupabaseVectorStoreConfig,
} from './types.js';

const indexNameSchema = z
  .string()
  .trim()
  .min(1, 'indexName is required.')
  .regex(
    INDEX_NAME_PATTERN,
    'indexName may only contain letters, numbers, ".", "_" and "-".'
  );

const pgIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    PG_IDENTIFIER_PATTERN,
    'Postgres identifiers must start with a letter or underscore and contain only letters, numbers, or underscores.'
  );

const connectionSchema = z.object({
  key: z.string().trim().min(1, 'connection.key is required.'),
  url: z.string().trim().url('connection.url must be a valid URL.'),
});

const vectorStoreConfigSchema = z
  .object({
    connection: connectionSchema,
    contentColumn: pgIdentifierSchema.optional().default(DEFAULT_CONTENT_COLUMN),
    defaultK: z
      .number()
      .int()
      .positive('defaultK must be a positive integer.')
      .optional()
      .default(DEFAULT_TOP_K),
    embedder: z.any(),
    embedderOptions: z.any().optional(),
    embeddingColumn: pgIdentifierSchema
      .optional()
      .default(DEFAULT_EMBEDDING_COLUMN),
    embeddingDimension: z
      .number()
      .int()
      .positive('embeddingDimension must be a positive integer.')
      .optional(),
    idColumn: pgIdentifierSchema.optional().default(DEFAULT_ID_COLUMN),
    indexName: indexNameSchema,
    metadataColumn: pgIdentifierSchema.optional().default(DEFAULT_METADATA_COLUMN),
    queryRpcName: pgIdentifierSchema
      .optional()
      .default(DEFAULT_QUERY_RPC_NAME),
    schema: pgIdentifierSchema.optional().default(DEFAULT_SCHEMA),
    table: pgIdentifierSchema.optional().default(DEFAULT_TABLE),
  })
  .strict();

export function normalizeVectorStoreConfig<
  EmbedderCustomOptions extends z.ZodTypeAny,
>(
  config: SupabaseVectorStoreConfig<EmbedderCustomOptions>
): NormalizedSupabaseVectorStoreConfig<EmbedderCustomOptions> {
  const parsed = vectorStoreConfigSchema.parse(config);

  if (!parsed.embedder) {
    throw createValidationError(
      `Config for index "${parsed.indexName}" is missing an embedder reference.`,
      parsed.indexName
    );
  }

  const columnNames = [
    parsed.idColumn,
    parsed.contentColumn,
    parsed.metadataColumn,
    parsed.embeddingColumn,
  ];

  if (new Set(columnNames).size !== columnNames.length) {
    throw createValidationError(
      `Config for index "${parsed.indexName}" must use distinct values for idColumn, contentColumn, metadataColumn, and embeddingColumn.`,
      parsed.indexName
    );
  }

  return parsed as NormalizedSupabaseVectorStoreConfig<EmbedderCustomOptions>;
}

export function normalizeVectorStoreConfigs<
  EmbedderCustomOptions extends z.ZodTypeAny,
>(
  configs: readonly SupabaseVectorStoreConfig<EmbedderCustomOptions>[]
): NormalizedSupabaseVectorStoreConfig<EmbedderCustomOptions>[] {
  if (!configs.length) {
    throw createValidationError(
      'supabaseVectorStore requires at least one index configuration.'
    );
  }

  const normalized = configs.map((config) => normalizeVectorStoreConfig(config));
  const seenIndexNames = new Set<string>();

  for (const config of normalized) {
    if (seenIndexNames.has(config.indexName)) {
      throw createValidationError(
        `Duplicate Supabase vector store indexName "${config.indexName}" found. Each configured indexName must be unique.`,
        config.indexName
      );
    }

    seenIndexNames.add(config.indexName);
  }

  return normalized;
}

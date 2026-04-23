import { z } from 'genkit';
import {
  CommonRetrieverOptionsSchema,
  indexerRef,
  retrieverRef,
} from 'genkit/retriever';

import { PLUGIN_NAME } from './constants.js';

export const SUPABASE_RETRIEVER_OPTIONS_SCHEMA =
  CommonRetrieverOptionsSchema.extend({
    k: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Number of documents to retrieve.'),
    filter: z
      .record(z.any())
      .optional()
      .describe(
        'JSONB metadata filter applied by the match RPC function. Supports plain objects plus operators like $in, $gte, and $contains.'
      ),
    similarityThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        'Minimum similarity score required in the RPC response. Requires the RPC to return a numeric similarity column.'
      ),
  });

export const SUPABASE_INDEXER_OPTIONS_SCHEMA = z
  .object({
    batchSize: z
      .number()
      .int()
      .positive()
      .max(500)
      .optional()
      .describe('Maximum number of documents to embed in each batch.'),
    ids: z
      .array(z.union([z.number().finite(), z.string().min(1)]))
      .optional()
      .describe('Document ids used when deleting records by id.'),
    operation: z
      .enum(['delete', 'upsert'])
      .optional()
      .describe('Defaults to "upsert". Use "delete" to remove rows by id.'),
  })
  .superRefine((value, ctx) => {
    if (value.operation === 'delete' && value.ids && value.ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ids must contain at least one document id when provided.',
        path: ['ids'],
      });
    }
  });

export type SupabaseRetrieverOptions = z.infer<
  typeof SUPABASE_RETRIEVER_OPTIONS_SCHEMA
>;
export type SupabaseIndexerOptions = z.infer<
  typeof SUPABASE_INDEXER_OPTIONS_SCHEMA
>;

export function buildActionName(indexName: string): string {
  return `${PLUGIN_NAME}/${indexName}`;
}

export function supabaseRetrieverRef(indexName: string) {
  return retrieverRef({
    name: buildActionName(indexName),
    info: {
      label: `Supabase Retriever - ${indexName}`,
    },
    configSchema: SUPABASE_RETRIEVER_OPTIONS_SCHEMA.optional(),
  });
}

export function supabaseIndexerRef(indexName: string) {
  return indexerRef({
    name: buildActionName(indexName),
    info: {
      label: `Supabase Indexer - ${indexName}`,
    },
    configSchema: SUPABASE_INDEXER_OPTIONS_SCHEMA.optional(),
  });
}

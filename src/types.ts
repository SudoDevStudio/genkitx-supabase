import type { z } from 'genkit';
import type { EmbedderArgument } from 'genkit/embedder';

export type SupabaseDocumentId = string | number;

export type SupabaseJsonPrimitive = boolean | number | null | string;
export type SupabaseJson =
  | SupabaseJsonPrimitive
  | SupabaseJson[]
  | { [key: string]: SupabaseJson };

export type SupabaseMetadataComparisonValue = SupabaseJson;

export interface SupabaseMetadataFilterOperators {
  $contains?: SupabaseMetadataComparisonValue;
  $eq?: SupabaseMetadataComparisonValue;
  $exists?: boolean;
  $gt?: number | string;
  $gte?: number | string;
  $in?: SupabaseMetadataComparisonValue[];
  $lt?: number | string;
  $lte?: number | string;
}

export type SupabaseMetadataFilterNode =
  | SupabaseMetadataComparisonValue
  | SupabaseMetadataFilter
  | SupabaseMetadataFilterOperators;

export interface SupabaseMetadataFilter {
  [key: string]: SupabaseMetadataFilterNode;
}

export interface SupabaseConnectionConfig {
  url: string;
  key: string;
}

export interface SupabaseVectorStoreConfig<
  EmbedderCustomOptions extends z.ZodTypeAny = z.ZodTypeAny,
> {
  indexName: string;
  embedder: EmbedderArgument<EmbedderCustomOptions>;
  embedderOptions?: z.infer<EmbedderCustomOptions>;
  connection: SupabaseConnectionConfig;
  table?: string;
  queryRpcName?: string;
  idColumn?: string;
  contentColumn?: string;
  metadataColumn?: string;
  embeddingColumn?: string;
  schema?: string;
  defaultK?: number;
  embeddingDimension?: number;
  onMissingId?: 'error' | 'generate';
}

export interface NormalizedSupabaseVectorStoreConfig<
  EmbedderCustomOptions extends z.ZodTypeAny = z.ZodTypeAny,
> extends Omit<
    SupabaseVectorStoreConfig<EmbedderCustomOptions>,
    | 'contentColumn'
    | 'defaultK'
    | 'embeddingColumn'
    | 'idColumn'
    | 'metadataColumn'
    | 'onMissingId'
    | 'queryRpcName'
    | 'schema'
    | 'table'
  > {
  table: string;
  queryRpcName: string;
  idColumn: string;
  contentColumn: string;
  metadataColumn: string;
  embeddingColumn: string;
  schema: string;
  defaultK: number;
  onMissingId: 'error' | 'generate';
}

export interface SupabaseRetrieverOptions {
  k?: number;
  filter?: SupabaseMetadataFilter;
  similarityThreshold?: number;
}

export interface SupabaseIndexerOptions {
  operation?: 'delete' | 'upsert';
  ids?: SupabaseDocumentId[];
  batchSize?: number;
}

export interface PreparedDocument {
  id: string;
  content: string;
  metadata: Record<string, SupabaseJson>;
}

export interface SupabaseMatchRpcPayload extends Record<string, unknown> {
  query_embedding: number[];
  match_count: number;
  filter: SupabaseMetadataFilter | null;
}

export interface SupabaseErrorLike {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

export interface SupabaseResponse<TData = unknown> {
  data: TData | null;
  error: SupabaseErrorLike | null;
}

export interface SupabaseDeleteBuilderLike {
  in(
    column: string,
    values: (string | number)[]
  ): PromiseLike<SupabaseResponse<null>>;
}

export interface SupabaseTableClientLike {
  delete(): SupabaseDeleteBuilderLike;
  upsert(
    values: Record<string, unknown>[],
    options?: {
      ignoreDuplicates?: boolean;
      onConflict?: string;
    }
  ): PromiseLike<SupabaseResponse<unknown>>;
}

export interface SupabaseClientLike {
  from(table: string): SupabaseTableClientLike;
  rpc<TData = unknown>(
    fn: string,
    args?: Record<string, unknown>
  ): PromiseLike<SupabaseResponse<TData>>;
}

export { supabaseVectorStore, supabaseVectorStore as default } from './plugin.js';
export {
  supabaseIndexerRef,
  supabaseRetrieverRef,
  SUPABASE_INDEXER_OPTIONS_SCHEMA,
  SUPABASE_RETRIEVER_OPTIONS_SCHEMA,
} from './refs.js';
export { SupabaseVectorStoreError } from './errors.js';

export type {
  NormalizedSupabaseVectorStoreConfig,
  SupabaseConnectionConfig,
  SupabaseDocumentId,
  SupabaseIndexerOptions,
  SupabaseJson,
  SupabaseJsonPrimitive,
  SupabaseMetadataFilter,
  SupabaseRetrieverOptions,
  SupabaseVectorStoreConfig,
} from './types.js';

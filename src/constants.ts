export const PLUGIN_NAME = 'supabaseVectorStore';
export const DEFAULT_SCHEMA = 'public';
export const DEFAULT_TABLE = 'rag_documents';
export const DEFAULT_QUERY_RPC_NAME = 'match_rag_documents';
export const DEFAULT_ID_COLUMN = 'id';
export const DEFAULT_CONTENT_COLUMN = 'content';
export const DEFAULT_METADATA_COLUMN = 'metadata';
export const DEFAULT_EMBEDDING_COLUMN = 'embedding';
export const DEFAULT_TOP_K = 3;
export const DEFAULT_BATCH_SIZE = 25;
export const CLIENT_INFO = '@sudodevstudio/genkitx-supabase';

export const INDEX_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const PG_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

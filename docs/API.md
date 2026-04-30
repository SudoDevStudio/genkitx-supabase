# API Reference

## Public exports

- `supabaseVectorStore(configs)`
- `supabaseIndexerRef(indexName)`
- `supabaseRetrieverRef(indexName)`
- `SupabaseVectorStoreError`
- exported TypeScript types from [`src/types.ts`](../src/types.ts)

## `supabaseVectorStore(configs)`

Registers one or more Supabase-backed vector stores by `indexName`.

### Config fields

- `indexName: string`
- `embedder`
- `embedderOptions?`
- `connection: { url: string; key: string }`
- `table?: string`
- `queryRpcName?: string`
- `idColumn?: string`
- `contentColumn?: string`
- `metadataColumn?: string`
- `embeddingColumn?: string`
- `schema?: string`
- `defaultK?: number`
- `embeddingDimension?: number`
- `onMissingId?: 'generate' | 'error'`

### Defaults

- `schema: 'public'`
- `table: 'rag_documents'`
- `queryRpcName: 'match_rag_documents'`
- `idColumn: 'id'`
- `contentColumn: 'content'`
- `metadataColumn: 'metadata'`
- `embeddingColumn: 'embedding'`
- `defaultK: 3`
- `onMissingId: 'generate'`

### Notes

- `indexName` values must be unique within one plugin registration.
- Postgres identifiers must use letters, numbers, and underscores only.
- `onMissingId: 'generate'` preserves current behavior and fills `metadata.id` with a generated UUID when needed.
- `onMissingId: 'error'` requires every indexed document to include `metadata.id`.
- `metadata.id` may be a `string` or `number`, and that scalar type is preserved through indexing, retrieval, and delete calls.
- Indexed documents must contain text content. Multi-part text is joined with spaces before embedding.

## `supabaseIndexerRef(indexName)`

Returns a Genkit indexer ref for `ai.index()`.

### Supported options

- `operation?: 'upsert' | 'delete'`
- `ids?: Array<string | number>`
- `batchSize?: number`

### Behavior

- Upserts use the configured `idColumn` as the conflict target.
- Delete operations accept `options.ids` or document `metadata.id` values.
- Delete operations require at least one resolved ID and fail fast when none are provided.
- `batchSize` must be a positive integer and is validated before embedding work begins.

## `supabaseRetrieverRef(indexName)`

Returns a Genkit retriever ref for `ai.retrieve()`.

### Supported options

- `k?: number`
- `filter?: Record<string, unknown>`
- `similarityThreshold?: number`

### Behavior

- `filter` is normalized as plain JSON and passed to your RPC as `jsonb`.
- `similarityThreshold` must be between `0` and `1`.
- When `similarityThreshold` is set, the RPC response must include a numeric `similarity` column for each row.
- Retrieval queries must contain text content. Multi-part query text is joined with spaces before embedding.

## SQL contract

The default RPC expects:

- `query_embedding extensions.vector(...)`
- `match_count int`
- `filter jsonb`

The default row mapping expects:

- `id`
- `content`
- `metadata`

Extra columns returned by the RPC are merged into Genkit document metadata. That includes `similarity`, `created_at`, and `updated_at` when you return them.

## Error model

Most package-specific failures throw `SupabaseVectorStoreError`.

Common causes:

- missing or invalid config
- SQL table or RPC mismatch
- invalid JSON metadata or filters
- vector dimension mismatch
- retrieval rows missing required columns
- `similarityThreshold` used without a numeric `similarity` field

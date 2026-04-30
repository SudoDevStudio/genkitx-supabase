# How @sudodevstudio/genkitx-supabase Works

`@sudodevstudio/genkitx-supabase` plugs a Supabase `pgvector` table into Genkit's indexer and retriever APIs.

## Flow

1. Configure `supabaseVectorStore()` with an `indexName`, embedder, and Supabase connection.
2. Call `ai.index()` with `supabaseIndexerRef(indexName)`.
3. The plugin reads `metadata.id` when present, or generates one by default. If `onMissingId: 'error'` is configured, indexing fails when `metadata.id` is missing.
4. The plugin extracts text-only content, joins multi-part text with spaces, creates embeddings, and upserts rows into your configured table.
5. Call `ai.retrieve()` with `supabaseRetrieverRef(indexName)`.
6. The plugin embeds the query text, calls your match RPC, and maps rows back into Genkit documents while preserving `string` or `number` IDs.
7. If `similarityThreshold` is set, low-scoring rows are dropped after the RPC response is validated.
8. If you want an answer, pass the retrieved docs into `ai.generate({ docs, prompt })`.

## Mental model

- Embedder: turns text into vectors
- Supabase `pgvector`: stores vectors and ranks matches
- Genkit retriever: keeps retrieval inside standard Genkit flows
- Your SQL RPC: defines how similarity, filtering, and extra row metadata work

## Input and delete rules

- Documents and retrieval queries must contain text content.
- Multi-part text is joined with spaces before embedding.
- Delete operations must resolve at least one ID from `options.ids` or document `metadata.id`.
- Metadata filters must be plain JSON objects.

## RPC contract

Your RPC should:

- accept `query_embedding`, `match_count`, and `filter`
- return rows with `id`, `content`, and `metadata`
- return numeric `similarity` values when you use `similarityThreshold`

Without `ai.generate()`, this package still gives you retrieval results.

For the complete API, see [`docs/API.md`](./docs/API.md). For setup and runtime issues, see [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

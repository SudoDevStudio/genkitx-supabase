# How @sudodevstudio/genkitx-supabase Works

`@sudodevstudio/genkitx-supabase` plugs a Supabase `pgvector` table into Genkit's indexer and retriever APIs.

## Flow

1. Configure `supabaseVectorStore()` with an `indexName`, embedder, and Supabase connection.
2. Call `ai.index()` with `supabaseIndexerRef(indexName)`.
3. The plugin extracts text, creates embeddings, and upserts rows into your configured table.
4. Call `ai.retrieve()` with `supabaseRetrieverRef(indexName)`.
5. The plugin embeds the query, calls your match RPC, and maps rows back into Genkit documents.
6. If `similarityThreshold` is set, low-scoring rows are dropped after the RPC response is validated.
7. If you want an answer, pass the retrieved docs into `ai.generate({ docs, prompt })`.

## Mental model

- Embedder: turns text into vectors
- Supabase `pgvector`: stores vectors and ranks matches
- Genkit retriever: keeps retrieval inside standard Genkit flows
- Your SQL RPC: defines how similarity, filtering, and extra row metadata work

Without `ai.generate()`, this package still gives you retrieval results.

For the complete API, see [`docs/API.md`](./docs/API.md). For setup and runtime issues, see [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

# How @sudodevstudio/genkitx-supabase Works

`@sudodevstudio/genkitx-supabase` plugs a Supabase `pgvector` table into Genkit's indexer and retriever APIs.

## Flow

1. Configure `supabaseVectorStore()` with an `indexName`, embedder, and Supabase connection.
2. Call `ai.index()` with `supabaseIndexerRef(indexName)`.
3. The plugin extracts document text, creates embeddings with the configured Genkit embedder, and upserts rows into Supabase.
4. Call `ai.retrieve()` with `supabaseRetrieverRef(indexName)`.
5. The plugin embeds the query, calls your match RPC, and maps the returned rows back into Genkit documents.
6. If you want a generated answer, pass those retrieved docs into `ai.generate({ docs, prompt })`.

## Mental Model

- Embedder: turns text into vectors
- Supabase pgvector: finds the nearest matching rows
- Genkit model: optionally turns retrieved docs into a final answer

Without `ai.generate()`, this package still gives you retrieval results.

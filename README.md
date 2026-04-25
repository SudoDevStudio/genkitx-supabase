# @sudodevstudio/genkitx-supabase

`@sudodevstudio/genkitx-supabase` is a Genkit community plugin that turns a Supabase Postgres + `pgvector` table into a Genkit indexer and retriever pair for RAG workflows.

If you want the short version first, see [`HOW_IT_WORKS.md`](./HOW_IT_WORKS.md).

It lets you keep embeddings, content, and JSONB metadata in Supabase while using the familiar Genkit flow:

- configure a plugin with an `indexName` and embedder
- index documents with `ai.index()`
- retrieve relevant documents with `ai.retrieve()`
- filter retrievals with JSONB metadata
- optionally apply a post-RPC `similarityThreshold`

## Why Supabase + Genkit

Supabase gives you managed Postgres, `pgvector`, and JSONB in one place. Genkit gives you a clean retrieval/indexing abstraction inside AI flows. Together, they make it easy to build RAG pipelines that stay close to your application data and use standard Postgres tooling.

## Features

- Genkit plugin UX modeled after existing vector-store integrations
- `supabaseVectorStore(configs)`
- `supabaseIndexerRef(indexName)`
- `supabaseRetrieverRef(indexName)`
- batch embedding and upsert indexing
- delete by id through `ai.index()`
- top-k semantic retrieval through a Supabase RPC function
- JSONB metadata filtering
- optional strict `metadata.id` enforcement with `onMissingId: 'error'`
- optional post-retrieval score filtering with `similarityThreshold`
- configurable schema, table, RPC, and column names
- useful validation and runtime errors

## Install

```bash
npm install @sudodevstudio/genkitx-supabase @supabase/supabase-js genkit
```

If you want to use the Google AI quickstart below:

```bash
npm install @genkit-ai/google-genai
```

## Quickstart

```ts
import { googleAI } from '@genkit-ai/google-genai';
import { Document, genkit } from 'genkit';
import {
  supabaseIndexerRef,
  supabaseRetrieverRef,
  supabaseVectorStore,
} from '@sudodevstudio/genkitx-supabase';

const ai = genkit({
  plugins: [
    googleAI(),
    supabaseVectorStore([
      {
        indexName: 'docs',
        embedder: googleAI.embedder('gemini-embedding-001'),
        connection: {
          url: process.env.SUPABASE_URL!,
          key: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        embeddingDimension: 3072,
      },
    ]),
  ],
});

const docsIndexer = supabaseIndexerRef('docs');
const docsRetriever = supabaseRetrieverRef('docs');

await ai.index({
  indexer: docsIndexer,
  documents: [
    Document.fromText('Supabase stores embeddings in Postgres.', {
      id: 1,
      topic: 'supabase',
    }),
  ],
});

const docs = await ai.retrieve({
  retriever: docsRetriever,
  query: 'Where are the embeddings stored?',
  options: { k: 3 },
});
```

## SQL Setup

The package expects:

- a pgvector-enabled table for documents
- an RPC function that accepts `query_embedding`, `match_count`, and `filter`
- rows containing your configured `id`, `content`, and `metadata` fields
- text content in both indexed documents and retrieval queries

SQL examples are included in:

- [`sql/001_create_rag_documents.sql`](./sql/001_create_rag_documents.sql)
- [`sql/002_match_rag_documents.sql`](./sql/002_match_rag_documents.sql)

Default schema example:

- `id text primary key`
- `content text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `embedding extensions.vector(3072) not null`
- `created_at timestamptz`
- `updated_at timestamptz`

If your embedder uses a different dimension, update both the table definition and the RPC function signature to match.

If you want numeric primary keys instead, that is supported by the package, but your table schema and RPC must return numeric `id` values consistently.

## Usage

### Configure the plugin

```ts
import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit';
import { supabaseVectorStore } from '@sudodevstudio/genkitx-supabase';

const ai = genkit({
  plugins: [
    googleAI(),
    supabaseVectorStore([
      {
        indexName: 'products',
        embedder: googleAI.embedder('gemini-embedding-001'),
        connection: {
          url: process.env.SUPABASE_URL!,
          key: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        schema: 'public',
        table: 'rag_documents',
        queryRpcName: 'match_rag_documents',
        idColumn: 'id',
        contentColumn: 'content',
        metadataColumn: 'metadata',
        embeddingColumn: 'embedding',
        defaultK: 5,
        embeddingDimension: 3072,
        onMissingId: 'generate',
      },
    ]),
  ],
});
```

### Index documents

Document ids are read from `document.metadata.id`. IDs may be `string` or `number`. If a document already exists with the same id, it is updated.

This package indexes text-only content. Multi-part content is joined with spaces before embedding and storage.

By default, missing `metadata.id` values are filled with a generated UUID. If you want strict ingestion, set `onMissingId: 'error'`.

```ts
import { Document } from 'genkit';
import { supabaseIndexerRef } from '@sudodevstudio/genkitx-supabase';

const productsIndexer = supabaseIndexerRef('products');

await ai.index({
  indexer: productsIndexer,
  documents: [
    Document.fromText('The red backpack fits a 16-inch laptop.', {
      id: 'sku-red-backpack',
      category: 'bags',
      inventoryStatus: 'in_stock',
    }),
    Document.fromText('The trail bottle keeps drinks cold for 18 hours.', {
      id: 'sku-trail-bottle',
      category: 'drinkware',
      inventoryStatus: 'in_stock',
    }),
  ],
});
```

### Delete documents by id

Use the same `ai.index()` call with delete options:

```ts
await ai.index({
  indexer: productsIndexer,
  documents: [],
  options: {
    operation: 'delete',
    ids: ['sku-trail-bottle'],
  },
});
```

You can also omit `options.ids` and pass documents that contain `metadata.id`.

Delete requests must resolve at least one id from `options.ids` or document `metadata.id`. Empty delete requests are rejected with a validation error.

### Retrieve documents

```ts
import { supabaseRetrieverRef } from '@sudodevstudio/genkitx-supabase';

const productsRetriever = supabaseRetrieverRef('products');

const docs = await ai.retrieve({
  retriever: productsRetriever,
  query: 'Which bag fits a laptop?',
  options: { k: 3 },
});
```

Retrieval queries are also text-only. If the query contains multiple text parts, they are joined with spaces before embedding.

### Metadata filter example

Metadata filters are passed to the RPC function as JSONB and work well with `metadata @> filter`.

```ts
const docs = await ai.retrieve({
  retriever: productsRetriever,
  query: 'Show me in-stock bags',
  options: {
    k: 5,
    filter: {
      category: 'bags',
      inventoryStatus: 'in_stock',
    },
  },
});
```

### Similarity threshold example

If your RPC returns a numeric `similarity` column, you can drop low-confidence rows after retrieval:

```ts
const docs = await ai.retrieve({
  retriever: productsRetriever,
  query: 'Show me the strongest backpack match',
  options: {
    k: 5,
    similarityThreshold: 0.8,
  },
});
```

## Public API

### `supabaseVectorStore(configs)`

Registers one or more Supabase-backed vector stores by `indexName`.

Config fields:

- `indexName`
- `embedder`
- `connection: { url, key }`
- `table?`
- `queryRpcName?`
- `idColumn?`
- `contentColumn?`
- `metadataColumn?`
- `embeddingColumn?`
- `schema?`
- `defaultK?`
- `embeddingDimension?`
- `embedderOptions?`
- `onMissingId?: 'generate' | 'error'`

Defaults:

- `schema: 'public'`
- `table: 'rag_documents'`
- `queryRpcName: 'match_rag_documents'`
- `idColumn: 'id'`
- `contentColumn: 'content'`
- `metadataColumn: 'metadata'`
- `embeddingColumn: 'embedding'`
- `defaultK: 3`
- `onMissingId: 'generate'`

Behavior notes:

- `metadata.id` may be a `string` or `number`.
- With `onMissingId: 'generate'`, missing IDs are replaced with generated UUIDs.
- With `onMissingId: 'error'`, indexing fails unless each document includes `metadata.id`.
- Documents and queries must contain text content. Non-text-only inputs are rejected.

### `supabaseIndexerRef(indexName)`

Returns the Genkit indexer reference for `ai.index()`.

Supported indexer options:

- `operation?: 'upsert' | 'delete'`
- `ids?: Array<string | number>`
- `batchSize?: number`

Delete behavior:

- `ids` may contain strings or numbers.
- Delete resolves ids from `options.ids` first, then falls back to document `metadata.id`.
- If no ids are resolved, the operation fails with a validation error.

### `supabaseRetrieverRef(indexName)`

Returns the Genkit retriever reference for `ai.retrieve()`.

Supported retriever options:

- `k?: number`
- `filter?: Record<string, unknown>`
- `similarityThreshold?: number`

Retriever behavior:

- `filter` must be a plain JSON object.
- `similarityThreshold` must be between `0` and `1`.
- When `similarityThreshold` is set, your RPC must return a numeric `similarity` column for each row.

## Constraints And Guarantees

- Text-only input: indexing and retrieval embed only text content, and multi-part text is joined with spaces.
- ID policy: document IDs are preserved as `string` or `number` across indexing, delete, and retrieval flows.
- Metadata normalization: metadata and filters must be plain JSON-compatible values with no `undefined`.
- Dimension enforcement: `embeddingDimension` validates embedder output length before data is sent to Postgres.
- RPC expectations: the RPC must accept `query_embedding`, `match_count`, and `filter`, and should return `id`, `content`, and `metadata`.

## Production Notes

- Use a service role key on trusted servers only. Do not expose it in browser bundles.
- Keep retrieval and indexing on the server side, especially when your table or RPC requires elevated database permissions.
- Make sure the RPC function lives in an exposed schema and that Row Level Security policies allow the operations you need.
- Keep your `embeddingDimension` aligned with the actual vector column dimension to catch mistakes before they hit Postgres.

## Repository Contents

- source: [`src/index.ts`](./src/index.ts)
- SQL: [`sql/001_create_rag_documents.sql`](./sql/001_create_rag_documents.sql), [`sql/002_match_rag_documents.sql`](./sql/002_match_rag_documents.sql)
- tests: [`test/config.test.ts`](./test/config.test.ts), [`test/mapping.test.ts`](./test/mapping.test.ts), [`test/filter.test.ts`](./test/filter.test.ts), [`test/store.test.ts`](./test/store.test.ts)

## License
See [`LICENSE`](./LICENSE) for the full terms.

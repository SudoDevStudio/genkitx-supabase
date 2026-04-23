import { describe, expect, it, vi } from 'vitest';

import { normalizeVectorStoreConfig } from '../src/config.js';
import { buildMatchRpcPayload } from '../src/mapping.js';
import { SupabaseVectorStore } from '../src/store.js';
import type {
  SupabaseClientLike,
  SupabaseResponse,
  SupabaseTableClientLike,
} from '../src/types.js';

const config = normalizeVectorStoreConfig({
  connection: {
    key: 'service-role-key',
    url: 'https://example.supabase.co',
  },
  defaultK: 7,
  embedder: { name: 'tests/embedder' },
  embeddingDimension: 3,
  indexName: 'docs',
});

const configWithNamedEmbedderRef = normalizeVectorStoreConfig({
  connection: {
    key: 'service-role-key',
    url: 'https://example.supabase.co',
  },
  embedder: {
    config: {
      model: 'nomic-embed-text',
    },
    name: 'tests/embedder',
  },
  embedderOptions: {
    taskType: 'retrieval_document',
  },
  embeddingDimension: 3,
  indexName: 'docs',
});

function createMockClient(overrides: Partial<SupabaseClientLike> = {}): SupabaseClientLike {
  const tableClient: SupabaseTableClientLike = {
    delete() {
      return {
        in: vi.fn<
          (column: string, values: string[]) => Promise<SupabaseResponse<null>>
        >().mockResolvedValue({
          data: null,
          error: null,
        }),
      };
    },
    upsert: vi.fn<
      (
        values: Record<string, unknown>[],
        options?: { ignoreDuplicates?: boolean; onConflict?: string }
      ) => Promise<SupabaseResponse<unknown>>
    >().mockResolvedValue({
      data: null,
      error: null,
    }),
  };

  return {
    from: vi.fn(() => tableClient),
    rpc: vi.fn().mockResolvedValue({
      data: [],
      error: null,
    }),
    ...overrides,
  };
}

describe('SupabaseVectorStore', () => {
  it('builds the expected rpc payload for retrieval', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          content: 'Stored in Postgres',
          id: 'doc-1',
          metadata: { category: 'guide' },
        },
      ],
      error: null,
    });
    const client = createMockClient({ rpc });
    const ai = {
      embed: vi.fn().mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]),
      embedMany: vi.fn(),
    };
    const store = new SupabaseVectorStore(ai as never, config, client);

    const docs = await store.retrieve(
      {
        content: [{ text: 'How is data stored?' }],
      },
      {
        filter: { category: 'guide' },
        k: 4,
      }
    );

    expect(rpc).toHaveBeenCalledWith(
      'match_rag_documents',
      buildMatchRpcPayload({
        filter: { category: 'guide' },
        k: 4,
        queryEmbedding: [0.1, 0.2, 0.3],
      })
    );
    expect(docs[0]?.metadata).toEqual({
      category: 'guide',
      id: 'doc-1',
    });
  });

  it('filters retrieved rows by similarityThreshold', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          content: 'High confidence document',
          id: 'doc-1',
          metadata: { category: 'guide' },
          similarity: 0.91,
        },
        {
          content: 'Low confidence document',
          id: 'doc-2',
          metadata: { category: 'guide' },
          similarity: 0.42,
        },
      ],
      error: null,
    });
    const client = createMockClient({ rpc });
    const ai = {
      embed: vi.fn().mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]),
      embedMany: vi.fn(),
    };
    const store = new SupabaseVectorStore(ai as never, config, client);

    const docs = await store.retrieve(
      {
        content: [{ text: 'Find the best guide.' }],
      },
      {
        k: 4,
        similarityThreshold: 0.8,
      }
    );

    expect(docs).toHaveLength(1);
    expect(docs[0]?.metadata).toMatchObject({
      id: 'doc-1',
      similarity: 0.91,
    });
  });

  it('throws a clear error when similarityThreshold is set but the rpc omits similarity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          content: 'Document without similarity',
          id: 'doc-1',
          metadata: { category: 'guide' },
        },
      ],
      error: null,
    });
    const client = createMockClient({ rpc });
    const ai = {
      embed: vi.fn().mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]),
      embedMany: vi.fn(),
    };
    const store = new SupabaseVectorStore(ai as never, config, client);

    await expect(
      store.retrieve(
        {
          content: [{ text: 'Find the best guide.' }],
        },
        {
          similarityThreshold: 0.8,
        }
      )
    ).rejects.toThrow(/must return a numeric "similarity" column/i);
  });

  it('post-filters rpc rows with advanced metadata operators', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          content: 'Supabase guide',
          id: 'doc-1',
          metadata: {
            category: 'guide',
            publishedAt: '2026-04-01',
            tags: ['rag', 'supabase'],
          },
        },
        {
          content: 'General note',
          id: 'doc-2',
          metadata: {
            category: 'note',
            publishedAt: '2025-12-01',
            tags: ['misc'],
          },
        },
      ],
      error: null,
    });
    const client = createMockClient({ rpc });
    const ai = {
      embed: vi.fn().mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]),
      embedMany: vi.fn(),
    };
    const store = new SupabaseVectorStore(ai as never, config, client);

    const docs = await store.retrieve(
      {
        content: [{ text: 'Find recent Supabase guides.' }],
      },
      {
        filter: {
          category: {
            $in: ['guide', 'reference'],
          },
          publishedAt: {
            $gte: '2026-01-01',
          },
          tags: {
            $contains: ['rag'],
          },
        },
        k: 5,
      }
    );

    expect(rpc).toHaveBeenCalledWith(
      'match_rag_documents',
      buildMatchRpcPayload({
        filter: {
          category: {
            $in: ['guide', 'reference'],
          },
          publishedAt: {
            $gte: '2026-01-01',
          },
          tags: {
            $contains: ['rag'],
          },
        },
        k: 5,
        queryEmbedding: [0.1, 0.2, 0.3],
      })
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]?.metadata).toMatchObject({
      category: 'guide',
      id: 'doc-1',
      publishedAt: '2026-04-01',
    });
  });

  it('upserts indexed documents with the configured id column as conflict target', async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const embedderAction = vi.fn().mockResolvedValue({
      embeddings: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    const client = createMockClient({
      from: vi.fn(() => ({
        delete() {
          return {
            in: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        },
        upsert,
      })),
    });
    const ai = {
      embed: vi.fn(),
      embedMany: vi.fn(),
      registry: {
        lookupAction: vi.fn().mockResolvedValue(embedderAction),
      },
    };
    const store = new SupabaseVectorStore(
      ai as never,
      configWithNamedEmbedderRef,
      client
    );

    await store.index([
      {
        content: [{ text: 'Upserts preserve ids.' }],
        metadata: { id: 'doc-1', topic: 'indexing' },
      },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      [
        {
          content: 'Upserts preserve ids.',
          embedding: [0.1, 0.2, 0.3],
          id: 'doc-1',
          metadata: {
            id: 'doc-1',
            topic: 'indexing',
          },
        },
      ],
      {
        ignoreDuplicates: false,
        onConflict: 'id',
      }
    );
    expect(ai.embedMany).not.toHaveBeenCalled();
    expect(ai.registry.lookupAction).toHaveBeenCalledWith('/embedder/tests/embedder');
    expect(embedderAction).toHaveBeenCalledWith({
      input: [
        {
          content: [{ text: 'Upserts preserve ids.' }],
        },
      ],
      options: {
        model: 'nomic-embed-text',
        taskType: 'retrieval_document',
      },
    });
  });

  it('deletes documents by id', async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const client = createMockClient({
      from: vi.fn(() => ({
        delete() {
          return { in: inFn };
        },
        upsert: vi.fn(),
      })),
    });
    const ai = {
      embed: vi.fn(),
      embedMany: vi.fn(),
      registry: {
        lookupAction: vi.fn(),
      },
    };
    const store = new SupabaseVectorStore(ai as never, config, client);

    await store.index([], {
      ids: ['doc-9'],
      operation: 'delete',
    });

    expect(inFn).toHaveBeenCalledWith('id', ['doc-9']);
  });

  it('requires metadata.id when onMissingId is set to error', async () => {
    const client = createMockClient();
    const ai = {
      embed: vi.fn(),
      embedMany: vi.fn(),
      registry: {
        lookupAction: vi.fn(),
      },
    };
    const strictConfig = normalizeVectorStoreConfig({
      connection: {
        key: 'service-role-key',
        url: 'https://example.supabase.co',
      },
      embedder: { name: 'tests/embedder' },
      embeddingDimension: 3,
      indexName: 'strict-docs',
      onMissingId: 'error',
    });
    const store = new SupabaseVectorStore(ai as never, strictConfig, client);

    await expect(
      store.index([
        {
          content: [{ text: 'This document is missing metadata.id' }],
        },
      ])
    ).rejects.toThrow(/missing metadata\.id/i);
  });
});

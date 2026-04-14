import { Document, genkit } from 'genkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import supabaseVectorStore, {
  supabaseIndexerRef,
  supabaseRetrieverRef,
} from '../src/index.js';

interface StoredRow {
  content: string;
  embedding: number[];
  id: string;
  metadata: Record<string, unknown>;
}

interface RpcCall {
  args?: Record<string, unknown>;
  fn: string;
}

const supabaseMock = vi.hoisted(() => {
  const state = {
    createClientCalls: [] as Array<{
      key: string;
      options: Record<string, unknown>;
      url: string;
    }>,
    lastRpcCall: null as RpcCall | null,
    rows: [] as StoredRow[],
  };

  const createClient = vi.fn(
    (url: string, key: string, options: Record<string, unknown>) => {
      state.createClientCalls.push({ key, options, url });

      return {
        from() {
          return {
            delete() {
              return {
                async in(column: string, values: Array<string | number>) {
                  const idsToDelete = new Set(values.map(String));

                  state.rows = state.rows.filter((row) => {
                    const candidate = row[column as keyof StoredRow];
                    return !idsToDelete.has(String(candidate));
                  });

                  return {
                    data: null,
                    error: null,
                  };
                },
              };
            },
            async upsert(
              values: Record<string, unknown>[],
              options?: { onConflict?: string }
            ) {
              const conflictColumn = options?.onConflict ?? 'id';

              for (const value of values) {
                const nextRow = value as unknown as StoredRow;
                const existingIndex = state.rows.findIndex(
                  (row) =>
                    String(row[conflictColumn as keyof StoredRow]) ===
                    String(nextRow[conflictColumn as keyof StoredRow])
                );

                if (existingIndex >= 0) {
                  state.rows[existingIndex] = nextRow;
                } else {
                  state.rows.push(nextRow);
                }
              }

              return {
                data: null,
                error: null,
              };
            },
          };
        },
        async rpc(fn: string, args?: Record<string, unknown>) {
          state.lastRpcCall = { args, fn };

          const filter = (args?.filter ?? null) as Record<string, unknown> | null;
          const matchCount = Number(args?.match_count ?? 0);
          const queryEmbedding = (args?.query_embedding ?? []) as number[];

          const rows = state.rows
            .filter((row) => matchesFilter(row.metadata, filter))
            .map((row) => ({
              ...row,
              similarity: cosineSimilarity(row.embedding, queryEmbedding),
            }))
            .sort((left, right) => right.similarity - left.similarity)
            .slice(0, matchCount);

          return {
            data: rows,
            error: null,
          };
        },
      };
    }
  );

  return {
    createClient,
    state,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMock.createClient,
}));

function vectorize(text: string): number[] {
  const normalized = text.toLowerCase();

  return [
    normalized.includes('supabase') ? 1 : 0,
    normalized.includes('retriev') ? 1 : 0,
    normalized.length / 100,
  ];
}

function cosineSimilarity(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value ** 2, 0));
  const rightMagnitude = Math.sqrt(
    right.reduce((sum, value) => sum + value ** 2, 0)
  );

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (leftMagnitude * rightMagnitude);
}

function matchesFilter(
  metadata: Record<string, unknown>,
  filter: Record<string, unknown> | null
): boolean {
  if (!filter) {
    return true;
  }

  return Object.entries(filter).every(([key, value]) => {
    const candidate = metadata[key];

    if (Array.isArray(value)) {
      return (
        Array.isArray(candidate) &&
        value.length === candidate.length &&
        value.every((item, index) => matchesValue(candidate[index], item))
      );
    }

    if (isPlainObject(value)) {
      return isPlainObject(candidate) && matchesFilter(candidate, value);
    }

    return matchesValue(candidate, value);
  });
}

function matchesValue(candidate: unknown, expected: unknown): boolean {
  if (isPlainObject(expected)) {
    return isPlainObject(candidate) && matchesFilter(candidate, expected);
  }

  return candidate === expected;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createAi() {
  const ai = genkit({
    plugins: [
      supabaseVectorStore([
        {
          connection: {
            key: 'service-role-key',
            url: 'https://example.supabase.co',
          },
          embedder: { name: 'tests/mock-embedder' },
          embeddingDimension: 3,
          indexName: 'docs',
        },
      ]),
    ],
  });

  ai.defineEmbedder(
    {
      info: {
        dimensions: 3,
        supports: {
          input: ['text'],
        },
      },
      name: 'tests/mock-embedder',
    },
    async (documents) => ({
      embeddings: documents.map((document) => ({
        embedding: vectorize(document.text),
      })),
    })
  );

  return ai;
}

describe('end-to-end vector store flow', () => {
  beforeEach(() => {
    supabaseMock.createClient.mockClear();
    supabaseMock.state.createClientCalls = [];
    supabaseMock.state.lastRpcCall = null;
    supabaseMock.state.rows = [];
  });

  it('indexes, retrieves, filters, and deletes documents through the public API', async () => {
    const ai = createAi();
    const indexer = supabaseIndexerRef('docs');
    const retriever = supabaseRetrieverRef('docs');

    await ai.index({
      documents: [
        Document.fromText('Supabase retrieval guide', {
          category: 'guide',
          id: 'doc-1',
          topic: 'supabase',
        }),
        Document.fromText('Cats prefer warm windowsills', {
          category: 'pets',
          id: 'doc-2',
          topic: 'animals',
        }),
      ],
      indexer,
      options: {
        batchSize: 1,
      },
    });

    expect(supabaseMock.createClient).toHaveBeenCalledTimes(1);
    expect(supabaseMock.state.createClientCalls[0]).toEqual({
      key: 'service-role-key',
      options: {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'X-Client-Info': '@sudodevstudio/genkitx-supabase',
          },
        },
      },
      url: 'https://example.supabase.co',
    });
    expect(supabaseMock.state.rows.map((row) => row.id).sort()).toEqual([
      'doc-1',
      'doc-2',
    ]);

    const retrieved = await ai.retrieve({
      options: {
        filter: { category: 'guide' },
        k: 2,
      },
      query: 'How does Supabase retrieval work?',
      retriever,
    });

    expect(supabaseMock.state.lastRpcCall).toEqual({
      args: {
        filter: { category: 'guide' },
        match_count: 2,
        query_embedding: vectorize('How does Supabase retrieval work?'),
      },
      fn: 'match_rag_documents',
    });
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]?.text).toBe('Supabase retrieval guide');
    expect(retrieved[0]?.metadata).toMatchObject({
      category: 'guide',
      id: 'doc-1',
      similarity: expect.any(Number),
      topic: 'supabase',
    });

    await ai.index({
      documents: [Document.fromText('delete doc-1', { id: 'doc-1' })],
      indexer,
      options: {
        operation: 'delete',
      },
    });

    expect(supabaseMock.state.rows.map((row) => row.id)).toEqual(['doc-2']);
  });
});

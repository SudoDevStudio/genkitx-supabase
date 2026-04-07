import { describe, expect, it } from 'vitest';

import { normalizeVectorStoreConfig, normalizeVectorStoreConfigs } from '../src/config.js';

const embedder = { name: 'tests/embedder' } as const;

describe('normalizeVectorStoreConfig', () => {
  it('applies defaults', () => {
    const config = normalizeVectorStoreConfig({
      connection: {
        key: 'service-role-key',
        url: 'https://example.supabase.co',
      },
      embedder,
      indexName: 'docs',
    });

    expect(config.schema).toBe('public');
    expect(config.table).toBe('rag_documents');
    expect(config.queryRpcName).toBe('match_rag_documents');
    expect(config.idColumn).toBe('id');
    expect(config.contentColumn).toBe('content');
    expect(config.metadataColumn).toBe('metadata');
    expect(config.embeddingColumn).toBe('embedding');
    expect(config.defaultK).toBe(3);
  });

  it('rejects duplicate configured index names', () => {
    expect(() =>
      normalizeVectorStoreConfigs([
        {
          connection: {
            key: 'service-role-key',
            url: 'https://example.supabase.co',
          },
          embedder,
          indexName: 'docs',
        },
        {
          connection: {
            key: 'service-role-key',
            url: 'https://example.supabase.co',
          },
          embedder,
          indexName: 'docs',
        },
      ])
    ).toThrow(/Duplicate Supabase vector store indexName/);
  });

  it('rejects invalid Postgres identifiers', () => {
    expect(() =>
      normalizeVectorStoreConfig({
        connection: {
          key: 'service-role-key',
          url: 'https://example.supabase.co',
        },
        embedder,
        indexName: 'docs',
        table: 'rag-documents',
      })
    ).toThrow(/Postgres identifiers/);
  });
});

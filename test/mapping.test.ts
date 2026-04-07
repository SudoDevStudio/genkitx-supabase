import { describe, expect, it } from 'vitest';

import { normalizeVectorStoreConfig } from '../src/config.js';
import { prepareDocumentForIndexing, rowToDocumentData } from '../src/mapping.js';

const config = normalizeVectorStoreConfig({
  connection: {
    key: 'service-role-key',
    url: 'https://example.supabase.co',
  },
  embedder: { name: 'tests/embedder' },
  indexName: 'docs',
});

describe('mapping helpers', () => {
  it('preserves document ids from metadata and normalizes metadata', () => {
    const prepared = prepareDocumentForIndexing(
      {
        content: [{ text: 'Supabase keeps metadata in JSONB.' }],
        metadata: {
          category: 'database',
          id: 'doc-42',
        },
      },
      0,
      'docs'
    );

    expect(prepared.id).toBe('doc-42');
    expect(prepared.content).toBe('Supabase keeps metadata in JSONB.');
    expect(prepared.metadata).toEqual({
      category: 'database',
      id: 'doc-42',
    });
  });

  it('maps rpc rows back into Genkit-compatible documents', () => {
    const document = rowToDocumentData(
      {
        content: 'Retriever results become Genkit documents.',
        created_at: '2026-03-31T00:00:00Z',
        id: 'rpc-doc',
        metadata: {
          category: 'retrieval',
        },
        similarity: 0.94,
      },
      config
    );

    expect(document.content).toEqual([
      { text: 'Retriever results become Genkit documents.' },
    ]);
    expect(document.metadata).toEqual({
      category: 'retrieval',
      created_at: '2026-03-31T00:00:00Z',
      id: 'rpc-doc',
      similarity: 0.94,
    });
  });
});

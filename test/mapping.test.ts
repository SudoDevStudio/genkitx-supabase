import { describe, expect, it } from 'vitest';

import { normalizeVectorStoreConfig } from '../src/config.js';
import {
  extractDocumentText,
  normalizeDocumentId,
  prepareDocumentForIndexing,
  resolveDeleteIds,
  rowToDocumentData,
} from '../src/mapping.js';

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
      'docs',
      'generate'
    );

    expect(prepared.id).toBe('doc-42');
    expect(prepared.content).toBe('Supabase keeps metadata in JSONB.');
    expect(prepared.metadata).toEqual({
      category: 'database',
      id: 'doc-42',
    });
  });

  it('preserves numeric document ids', () => {
    const prepared = prepareDocumentForIndexing(
      {
        content: [{ text: 'Numeric ids should round-trip.' }],
        metadata: {
          id: 42,
          topic: 'ids',
        },
      },
      0,
      'docs',
      'generate'
    );

    expect(prepared.id).toBe(42);
    expect(prepared.metadata).toEqual({
      id: 42,
      topic: 'ids',
    });
  });

  it('requires metadata.id when configured to error on missing ids', () => {
    expect(() =>
      prepareDocumentForIndexing(
        {
          content: [{ text: 'Missing ids should fail when configured.' }],
        },
        0,
        'docs',
        'error'
      )
    ).toThrow(/missing metadata\.id/i);
  });

  it('joins multipart text with spaces', () => {
    expect(
      extractDocumentText(
        {
          content: [{ text: 'Supabase' }, { text: 'retrieval' }, { text: 'guide' }],
        },
        'Multipart document'
      )
    ).toBe('Supabase retrieval guide');
  });

  it('keeps numeric ids as numbers when normalizing ids', () => {
    expect(normalizeDocumentId(9, 'Numeric id')).toBe(9);
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

  it('preserves numeric ids when mapping rpc rows', () => {
    const document = rowToDocumentData(
      {
        content: 'Numeric primary keys should be preserved.',
        id: 7,
        metadata: {
          category: 'retrieval',
        },
      },
      config
    );

    expect(document.metadata).toEqual({
      category: 'retrieval',
      id: 7,
    });
  });

  it('throws when delete resolves to no ids', () => {
    expect(() => resolveDeleteIds([], undefined, 'docs')).toThrow(
      /requires at least one id/i
    );
  });

  it('preserves numeric ids during delete resolution', () => {
    expect(
      resolveDeleteIds(
        [
          {
            content: [{ text: 'Delete me.' }],
            metadata: {
              id: 15,
            },
          },
        ],
        undefined,
        'docs'
      )
    ).toEqual([15]);
  });
});

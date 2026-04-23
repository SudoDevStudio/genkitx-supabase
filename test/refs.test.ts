import { describe, expect, it } from 'vitest';

import {
  SUPABASE_INDEXER_OPTIONS_SCHEMA,
  SUPABASE_RETRIEVER_OPTIONS_SCHEMA,
  supabaseIndexerRef,
  supabaseRetrieverRef,
} from '../src/index.js';

describe('public refs and schemas', () => {
  it('creates indexer and retriever refs with the expected action names', () => {
    expect(supabaseIndexerRef('docs')).toMatchObject({
      info: {
        label: 'Supabase Indexer - docs',
      },
      name: 'supabaseVectorStore/docs',
    });

    expect(supabaseRetrieverRef('docs')).toMatchObject({
      info: {
        label: 'Supabase Retriever - docs',
      },
      name: 'supabaseVectorStore/docs',
    });
  });

  it('validates supported retriever and indexer options', () => {
    expect(
      SUPABASE_RETRIEVER_OPTIONS_SCHEMA.parse({
        filter: {
          category: {
            $in: ['guide', 'reference'],
          },
          publishedAt: {
            $gte: '2026-01-01',
          },
        },
        k: 3,
        similarityThreshold: 0.8,
      })
    ).toEqual({
      filter: {
        category: {
          $in: ['guide', 'reference'],
        },
        publishedAt: {
          $gte: '2026-01-01',
        },
      },
      k: 3,
      similarityThreshold: 0.8,
    });

    expect(
      SUPABASE_INDEXER_OPTIONS_SCHEMA.parse({
        batchSize: 10,
        ids: ['doc-1'],
        operation: 'delete',
      })
    ).toEqual({
      batchSize: 10,
      ids: ['doc-1'],
      operation: 'delete',
    });

    expect(() =>
      SUPABASE_RETRIEVER_OPTIONS_SCHEMA.parse({
        k: 0,
      })
    ).toThrow(/greater than 0|positive/i);

    expect(() =>
      SUPABASE_RETRIEVER_OPTIONS_SCHEMA.parse({
        similarityThreshold: 1.2,
      })
    ).toThrow(/less than or equal to 1|max/i);

    expect(() =>
      SUPABASE_INDEXER_OPTIONS_SCHEMA.parse({
        ids: [],
        operation: 'delete',
      })
    ).toThrow(/ids must contain at least one document id/i);
  });
});

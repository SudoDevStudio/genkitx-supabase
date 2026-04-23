import { describe, expect, it } from 'vitest';

import { matchesMetadataFilter, normalizeMetadataFilter } from '../src/json.js';

describe('normalizeMetadataFilter', () => {
  it('accepts nested JSON objects', () => {
    expect(
      normalizeMetadataFilter({
        category: 'guides',
        flags: {
          featured: true,
        },
      })
    ).toEqual({
      category: 'guides',
      flags: {
        featured: true,
      },
    });
  });

  it('accepts advanced operator filters', () => {
    expect(
      normalizeMetadataFilter({
        category: {
          $in: ['guide', 'reference'],
        },
        publishedAt: {
          $gte: '2026-01-01',
          $lt: '2027-01-01',
        },
        score: {
          $gt: 0.8,
        },
        tags: {
          $contains: ['rag'],
        },
      })
    ).toEqual({
      category: {
        $in: ['guide', 'reference'],
      },
      publishedAt: {
        $gte: '2026-01-01',
        $lt: '2027-01-01',
      },
      score: {
        $gt: 0.8,
      },
      tags: {
        $contains: ['rag'],
      },
    });
  });

  it('rejects non-object filters', () => {
    expect(() => normalizeMetadataFilter(['guides'])).toThrow(
      /Retriever metadata filter must be a JSON object/
    );
  });

  it('rejects mixed operator and nested field objects', () => {
    expect(() =>
      normalizeMetadataFilter({
        category: {
          $eq: 'guide',
          slug: 'guides',
        },
      })
    ).toThrow(/cannot mix filter operators with nested metadata fields/i);
  });

  it('rejects invalid operator values', () => {
    expect(() =>
      normalizeMetadataFilter({
        publishedAt: {
          $gt: true,
        },
      })
    ).toThrow(/\$gt must be a string or a finite number/i);

    expect(() =>
      normalizeMetadataFilter({
        category: {
          $in: [],
        },
      })
    ).toThrow(/\$in must be a non-empty array/i);
  });

  it('rejects undefined nested values', () => {
    expect(() =>
      normalizeMetadataFilter({
        category: undefined,
      })
    ).toThrow(/cannot contain undefined values/);
  });
});

describe('matchesMetadataFilter', () => {
  it('supports equality, range, contains, exists, and in operators', () => {
    const metadata = {
      category: 'guide',
      flags: {
        featured: true,
      },
      publishedAt: '2026-04-01',
      score: 0.92,
      tags: ['rag', 'supabase'],
    } as const;

    expect(
      matchesMetadataFilter(
        metadata,
        normalizeMetadataFilter({
          category: {
            $in: ['guide', 'reference'],
          },
          flags: {
            featured: true,
          },
          publishedAt: {
            $gte: '2026-01-01',
            $lte: '2026-12-31',
          },
          score: {
            $gt: 0.9,
          },
          tags: {
            $contains: ['rag'],
          },
          summary: {
            $exists: false,
          },
        })
      )
    ).toBe(true);
  });

  it('returns false when a comparison does not match', () => {
    const metadata = {
      category: 'guide',
      score: 0.65,
      tags: ['rag', 'supabase'],
    } as const;

    expect(
      matchesMetadataFilter(
        metadata,
        normalizeMetadataFilter({
          category: {
            $eq: 'reference',
          },
        })
      )
    ).toBe(false);

    expect(
      matchesMetadataFilter(
        metadata,
        normalizeMetadataFilter({
          score: {
            $gte: 0.8,
          },
        })
      )
    ).toBe(false);

    expect(
      matchesMetadataFilter(
        metadata,
        normalizeMetadataFilter({
          tags: {
            $contains: ['postgres'],
          },
        })
      )
    ).toBe(false);
  });
});

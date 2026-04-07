import { describe, expect, it } from 'vitest';

import { normalizeMetadataFilter } from '../src/json.js';

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

  it('rejects non-object filters', () => {
    expect(() => normalizeMetadataFilter(['guides'])).toThrow(
      /Retriever metadata filter must be a JSON object/
    );
  });

  it('rejects undefined nested values', () => {
    expect(() =>
      normalizeMetadataFilter({
        category: undefined,
      })
    ).toThrow(/cannot contain undefined values/);
  });
});

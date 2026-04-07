import { type z } from 'genkit';
import type { GenkitPlugin } from 'genkit/plugin';
import { genkitPlugin } from 'genkit/plugin';

import { PLUGIN_NAME } from './constants.js';
import { normalizeVectorStoreConfigs } from './config.js';
import { buildActionName, SUPABASE_INDEXER_OPTIONS_SCHEMA, SUPABASE_RETRIEVER_OPTIONS_SCHEMA } from './refs.js';
import { SupabaseVectorStore } from './store.js';
import type { SupabaseVectorStoreConfig } from './types.js';

export function supabaseVectorStore<
  EmbedderCustomOptions extends z.ZodTypeAny = z.ZodTypeAny,
>(
  configs: readonly SupabaseVectorStoreConfig<EmbedderCustomOptions>[]
): GenkitPlugin {
  const normalizedConfigs = normalizeVectorStoreConfigs(configs);

  return genkitPlugin(PLUGIN_NAME, async (ai) => {
    for (const config of normalizedConfigs) {
      const vectorStore = new SupabaseVectorStore(ai, config);
      const actionName = buildActionName(config.indexName);

      ai.defineRetriever(
        {
          configSchema: SUPABASE_RETRIEVER_OPTIONS_SCHEMA,
          info: {
            label: `Supabase Retriever - ${config.indexName}`,
          },
          name: actionName,
        },
        async (query, options) => ({
          documents: await vectorStore.retrieve(query.toJSON(), options),
        })
      );

      ai.defineIndexer(
        {
          configSchema: SUPABASE_INDEXER_OPTIONS_SCHEMA,
          name: actionName,
        },
        async (documents, options) => {
          await vectorStore.index(
            documents.map((document) => document.toJSON()),
            options
          );
        }
      );
    }
  });
}

export default supabaseVectorStore;

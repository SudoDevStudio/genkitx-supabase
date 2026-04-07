import { createClient } from '@supabase/supabase-js';
import type { Embedding, Genkit } from 'genkit';
import { Document } from 'genkit';
import { type DocumentData } from 'genkit/retriever';

import { CLIENT_INFO, DEFAULT_BATCH_SIZE } from './constants.js';
import {
  createValidationError,
  formatRelation,
  formatRpcTarget,
  getErrorMessage,
  SupabaseVectorStoreError,
  wrapSupabaseFailure,
} from './errors.js';
import {
  buildMatchRpcPayload,
  buildUpsertRow,
  extractDocumentText,
  normalizeEmbeddingVector,
  prepareDocumentForIndexing,
  resolveDeleteIds,
  rowToDocumentData,
} from './mapping.js';
import type {
  NormalizedSupabaseVectorStoreConfig,
  SupabaseClientLike,
  SupabaseIndexerOptions,
  SupabaseRetrieverOptions,
} from './types.js';

type GenkitEmbedderRuntime = Pick<Genkit, 'embed' | 'embedMany' | 'registry'>;

interface NamedEmbedderRef {
  name: string;
  config?: Record<string, unknown>;
  version?: string;
}

interface EmbedderResponse {
  embeddings: Embedding[];
}

type EmbedderActionLike = (
  request: {
    input: DocumentData[];
    options?: Record<string, unknown>;
  }
) => Promise<EmbedderResponse>;

function chunk<T>(values: readonly T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }

  return batches;
}

export function createSupabaseClient(
  config: NormalizedSupabaseVectorStoreConfig
): SupabaseClientLike {
  const createClientUntyped = createClient as unknown as (
    url: string,
    key: string,
    options: {
      auth: {
        autoRefreshToken: boolean;
        detectSessionInUrl: boolean;
        persistSession: boolean;
      };
      db: {
        schema: string;
      };
      global: {
        headers: Record<string, string>;
      };
    }
  ) => SupabaseClientLike;

  return createClientUntyped(config.connection.url, config.connection.key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    db: {
      schema: config.schema,
    },
    global: {
      headers: {
        'X-Client-Info': CLIENT_INFO,
      },
    },
  });
}

function isNamedEmbedderRef(value: unknown): value is NamedEmbedderRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

function getEmbedderOptions(
  embedder: NamedEmbedderRef,
  embedderOptions: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const options = {
    ...(embedder.version ? { version: embedder.version } : {}),
    ...(embedder.config ?? {}),
    ...(embedderOptions ?? {}),
  };

  return Object.keys(options).length > 0 ? options : undefined;
}

export class SupabaseVectorStore {
  constructor(
    private readonly ai: GenkitEmbedderRuntime,
    private readonly config: NormalizedSupabaseVectorStoreConfig,
    private readonly client: SupabaseClientLike = createSupabaseClient(config)
  ) {}

  async index(
    documents: readonly DocumentData[],
    options?: SupabaseIndexerOptions
  ): Promise<void> {
    if (options?.operation === 'delete') {
      await this.deleteById(documents, options);
      return;
    }

    if (!documents.length) {
      return;
    }

    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw createValidationError(
        `batchSize for index "${this.config.indexName}" must be a positive integer.`,
        this.config.indexName
      );
    }

    const preparedDocuments = documents.map((document, index) =>
      prepareDocumentForIndexing(document, index, this.config.indexName)
    );

    for (const batch of chunk(preparedDocuments, batchSize)) {
      const embeddings = await this.embedBatch(batch);
      const rows = batch.map((document, index) =>
        buildUpsertRow(document, embeddings[index], this.config)
      );

      try {
        const response = await this.client.from(this.config.table).upsert(rows, {
          ignoreDuplicates: false,
          onConflict: this.config.idColumn,
        });

        if (response.error) {
          throw wrapSupabaseFailure(
            this.config,
            'Document upsert',
            response.error,
            `Ensure ${formatRelation(this.config)} exists, the id/content/metadata/embedding columns are correct, and the key has permission to upsert rows.`
          );
        }
      } catch (error) {
        if (error instanceof SupabaseVectorStoreError) {
          throw error;
        }

        throw new SupabaseVectorStoreError(
          `Document upsert failed for index "${this.config.indexName}". ${getErrorMessage(error)}`,
          {
            cause: error,
            indexName: this.config.indexName,
          }
        );
      }
    }
  }

  async retrieve(
    query: DocumentData,
    options?: SupabaseRetrieverOptions
  ): Promise<DocumentData[]> {
    const queryText = extractDocumentText(
      query,
      `Retriever query for index "${this.config.indexName}"`
    );
    const queryEmbedding = await this.embedQuery(queryText);
    const payload = buildMatchRpcPayload({
      filter: options?.filter,
      k: options?.k ?? this.config.defaultK,
      queryEmbedding,
    });

    try {
      const response = await this.client.rpc<Record<string, unknown>[]>(
        this.config.queryRpcName,
        payload
      );

      if (response.error) {
        throw wrapSupabaseFailure(
          this.config,
          'Retriever RPC',
          response.error,
          `Ensure ${formatRpcTarget(this.config)} exists and accepts query_embedding, match_count, and filter arguments.`
        );
      }

      if (!Array.isArray(response.data)) {
        throw new SupabaseVectorStoreError(
          `Retriever RPC ${formatRpcTarget(this.config)} returned an unexpected payload. Expected an array of rows.`,
          { indexName: this.config.indexName }
        );
      }

      return response.data.map((row) => rowToDocumentData(row, this.config));
    } catch (error) {
      if (error instanceof SupabaseVectorStoreError) {
        throw error;
      }

      throw new SupabaseVectorStoreError(
        `Retriever RPC failed for index "${this.config.indexName}". ${getErrorMessage(error)}`,
        {
          cause: error,
          indexName: this.config.indexName,
        }
      );
    }
  }

  private async deleteById(
    documents: readonly DocumentData[],
    options?: SupabaseIndexerOptions
  ): Promise<void> {
    const ids = resolveDeleteIds(documents, options?.ids, this.config.indexName);

    if (!ids.length) {
      return;
    }

    try {
      const response = await this.client
        .from(this.config.table)
        .delete()
        .in(this.config.idColumn, ids);

      if (response.error) {
        throw wrapSupabaseFailure(
          this.config,
          'Document delete',
          response.error,
          `Ensure ${formatRelation(this.config)} exists and ${this.config.idColumn} is the correct id column.`
        );
      }
    } catch (error) {
      if (error instanceof SupabaseVectorStoreError) {
        throw error;
      }

      throw new SupabaseVectorStoreError(
        `Document delete failed for index "${this.config.indexName}". ${getErrorMessage(error)}`,
        {
          cause: error,
          indexName: this.config.indexName,
        }
      );
    }
  }

  private async embedBatch(
    batch: readonly { content: string }[]
  ): Promise<number[][]> {
    let embeddings: Embedding[];

    try {
      embeddings = await this.runEmbedMany(batch.map((document) => document.content));
    } catch (error) {
      throw new SupabaseVectorStoreError(
        `Embedding batch failed for index "${this.config.indexName}". ${getErrorMessage(error)}`,
        {
          cause: error,
          indexName: this.config.indexName,
        }
      );
    }

    if (embeddings.length !== batch.length) {
      throw new SupabaseVectorStoreError(
        `Embedder returned ${embeddings.length} embeddings for ${batch.length} documents on index "${this.config.indexName}". Expected exactly one embedding per document.`,
        { indexName: this.config.indexName }
      );
    }

    return embeddings.map((embedding, index) =>
      normalizeEmbeddingVector(
        embedding.embedding,
        `Embedding ${index + 1} for index "${this.config.indexName}"`,
        this.config.embeddingDimension
      )
    );
  }

  private async runEmbedMany(contents: string[]): Promise<Embedding[]> {
    const embedder = this.config.embedder as unknown;

    if (
      isNamedEmbedderRef(embedder) &&
      !('info' in embedder) &&
      !('__action' in embedder)
    ) {
      const embedderAction = (await this.ai.registry.lookupAction(
        `/embedder/${embedder.name}`
      )) as EmbedderActionLike | undefined;

      if (!embedderAction) {
        throw new SupabaseVectorStoreError(
          `Unable to resolve embedder "${embedder.name}" for index "${this.config.indexName}". Ensure the Genkit plugin that provides it is registered before supabaseVectorStore().`,
          { indexName: this.config.indexName }
        );
      }

      const response = await embedderAction({
        input: contents.map((content) => Document.fromText(content)),
        options: getEmbedderOptions(
          embedder,
          this.config.embedderOptions as Record<string, unknown> | undefined
        ),
      });

      return response.embeddings;
    }

    return this.ai.embedMany({
      content: contents,
      embedder: this.config.embedder,
      options: this.config.embedderOptions,
    });
  }

  private async embedQuery(queryText: string): Promise<number[]> {
    let embeddings: Embedding[];

    try {
      embeddings = await this.ai.embed({
        content: queryText,
        embedder: this.config.embedder,
        options: this.config.embedderOptions,
      });
    } catch (error) {
      throw new SupabaseVectorStoreError(
        `Query embedding failed for index "${this.config.indexName}". ${getErrorMessage(error)}`,
        {
          cause: error,
          indexName: this.config.indexName,
        }
      );
    }

    if (embeddings.length !== 1) {
      throw new SupabaseVectorStoreError(
        `Embedder returned ${embeddings.length} embeddings for the retrieval query on index "${this.config.indexName}". Expected exactly one embedding.`,
        { indexName: this.config.indexName }
      );
    }

    return normalizeEmbeddingVector(
      embeddings[0].embedding,
      `Retriever query embedding for index "${this.config.indexName}"`,
      this.config.embeddingDimension
    );
  }
}

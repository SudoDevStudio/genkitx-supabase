import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit';
import {
  supabaseIndexerRef,
  supabaseRetrieverRef,
  supabaseVectorStore,
} from '@sudodevstudio/genkitx-supabase';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createAi() {
  return genkit({
    plugins: [
      googleAI(),
      supabaseVectorStore([
        {
          indexName: 'docs',
          embedder: googleAI.embedder('gemini-embedding-001'),
          connection: {
            url: requiredEnv('SUPABASE_URL'),
            key: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
          },
          embeddingDimension: 3072,
          onMissingId: 'error',
        },
      ]),
    ],
  });
}

export const docsIndexer = supabaseIndexerRef('docs');
export const docsRetriever = supabaseRetrieverRef('docs');

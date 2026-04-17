import { Document } from 'genkit';

import { createAi, docsIndexer } from './client.js';

async function main(): Promise<void> {
  const ai = createAi();

  await ai.index({
    indexer: docsIndexer,
    documents: [
      Document.fromText(
        'Supabase stores vectors in Postgres with pgvector and JSONB metadata.',
        {
          id: 'supabase-storage',
          topic: 'supabase',
          type: 'guide',
        }
      ),
      Document.fromText(
        'Genkit retrievers can pull documents before generation for RAG workflows.',
        {
          id: 'genkit-retrieval',
          topic: 'genkit',
          type: 'guide',
        }
      ),
    ],
  });

  console.log('Indexed 2 example documents into the "docs" store.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

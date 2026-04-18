import { createAi, docsRetriever } from './client.js';

async function main(): Promise<void> {
  const ai = createAi();
  const docs = await ai.retrieve({
    retriever: docsRetriever,
    query: 'How does Genkit use Supabase for retrieval?',
    options: {
      k: 3,
      similarityThreshold: 0.7,
      filter: {
        type: 'guide',
      },
    },
  });

  console.log(
    JSON.stringify(
      docs.map((doc) => ({
        metadata: doc.metadata,
        text: doc.text,
      })),
      null,
      2
    )
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

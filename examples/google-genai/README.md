# Google GenAI Example

This example shows the package in the setup it is optimized for: Genkit + Supabase with Google GenAI embeddings.

## 1. Create the SQL objects

Run:

- [`../../sql/001_create_rag_documents.sql`](../../sql/001_create_rag_documents.sql)
- [`../../sql/002_match_rag_documents.sql`](../../sql/002_match_rag_documents.sql)

If you use `gemini-embedding-001`, update the vector dimension in both SQL files from `768` to `3072`.

## 2. Provide environment variables

Copy [`.env.example`](./.env.example) and fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`

## 3. Install runtime dependencies

```bash
npm install genkit @supabase/supabase-js @genkit-ai/google-genai @sudodevstudio/genkitx-supabase
```

## 4. Run the scripts

```bash
npx tsx examples/google-genai/index-docs.ts
npx tsx examples/google-genai/retrieve-docs.ts
```

The workspace CI smoke-checks this example with `npm run test:example`.

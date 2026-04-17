# Troubleshooting

## `connection.url must be a valid URL`

Your `connection.url` must be a full Supabase project URL such as `https://<project>.supabase.co`.

## Missing table or RPC errors

If you see failures mentioning `public.rag_documents` or `public.match_rag_documents`:

1. Run [`sql/001_create_rag_documents.sql`](../sql/001_create_rag_documents.sql)
2. Run [`sql/002_match_rag_documents.sql`](../sql/002_match_rag_documents.sql)
3. Confirm your schema, table, and RPC names match the plugin config

## `embeddingDimension` mismatch errors

Your embedder output length must match the vector dimension declared in Postgres.

Examples:

- `gemini-embedding-001` commonly uses `3072`
- the sample SQL files ship with `768`, so update them if your embedder uses a different size

## `similarityThreshold` errors

If retrieval fails with a message about a missing numeric `similarity` column, update your RPC to return a `similarity double precision` field. The package only applies threshold filtering after it can validate that score.

## Missing `metadata.id`

By default, the package generates a UUID when a document is missing `metadata.id`.

If you set `onMissingId: 'error'`, every indexed document must provide an explicit `metadata.id`. This is useful when you want stable upserts and stricter ingestion guarantees.

## Empty or invalid metadata filters

Filters must be plain JSON objects. Values such as `Date`, `Map`, `Set`, functions, or `undefined` are rejected before the RPC call.

## Supabase auth and RLS issues

- Use a service role key only in trusted server environments.
- If you call retrieval with a restricted key, make sure the schema is exposed and the role has `EXECUTE` permission on the RPC.
- If RLS is enabled for non-service roles, add matching `SELECT` policies for the underlying table.

## Still stuck?

Open an issue with:

- your plugin config
- the SQL shape for your table and RPC
- the exact error message
- whether you are using a service role, anon key, or another server-side role

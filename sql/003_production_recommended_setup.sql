-- Recommended production additions for public.rag_documents and public.match_rag_documents.
-- Adjust role names, dimensions, and policies to match your deployment model.

create index if not exists rag_documents_embedding_hnsw_idx
  on public.rag_documents
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists rag_documents_metadata_gin_idx
  on public.rag_documents
  using gin (metadata jsonb_path_ops);

grant usage on schema public to authenticated;
grant execute on function public.match_rag_documents(extensions.vector, int, jsonb)
  to authenticated;

alter table public.rag_documents enable row level security;

-- Example read policy for retrieval when you are not using the service role.
-- Customize the USING clause for your tenancy and access rules.
-- create policy "rag_documents_select"
-- on public.rag_documents
-- for select
-- to authenticated
-- using (true);

-- Expected RPC row shape when using similarityThreshold:
-- returns table (
--   id text,
--   content text,
--   metadata jsonb,
--   similarity double precision
-- );

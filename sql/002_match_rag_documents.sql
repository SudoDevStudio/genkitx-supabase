create or replace function public.match_rag_documents(
  query_embedding extensions.vector(768),
  match_count int default 3,
  filter jsonb default null
)
returns table (
  id text,
  content text,
  metadata jsonb,
  similarity double precision,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    rag_documents.id,
    rag_documents.content,
    rag_documents.metadata,
    1 - (rag_documents.embedding <=> query_embedding) as similarity,
    rag_documents.created_at,
    rag_documents.updated_at
  from public.rag_documents
  where
    filter is null
    or rag_documents.metadata @> filter
  order by rag_documents.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

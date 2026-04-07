create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.rag_documents (
  id text primary key,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rag_documents_embedding_hnsw_idx
  on public.rag_documents
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists rag_documents_metadata_gin_idx
  on public.rag_documents
  using gin (metadata jsonb_path_ops);

drop trigger if exists set_rag_documents_updated_at on public.rag_documents;

create trigger set_rag_documents_updated_at
before update on public.rag_documents
for each row
execute function public.set_updated_at();

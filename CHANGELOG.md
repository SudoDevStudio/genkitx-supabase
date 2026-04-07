# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-01

### Added
- Initial release of @sudodevstudio/genkitx-supabase
- Supabase + pgvector integration for Genkit RAG workflows
- IndexerRef and RetrieverRef implementations
- Configurable vector store with flexible schema, table, RPC, and column names
- Batch embedding and upsert indexing capabilities
- Top-k semantic retrieval through Supabase RPC functions
- JSONB metadata filtering support
- Delete by ID through `ai.index()`
- Validation and comprehensive runtime errors
- Full TypeScript support with exported types

# Contributing

Thanks for helping improve `@sudodevstudio/genkitx-supabase`.

## Local setup

```bash
npm ci
npm run lint
npm run test
npm run test:e2e
npm run test:example
npm run build
```

## Expectations for changes

- Keep pull requests small and reviewable when possible.
- Add or update tests for behavior changes.
- Update docs when public behavior, setup, or examples change.
- If you touch the official example, keep the smoke test passing.
- If you change release-facing behavior, add a changelog entry under `Unreleased`.

## Working areas

- source: [`src`](./src)
- tests: [`test`](./test)
- SQL: [`sql`](./sql)
- docs: [`docs`](./docs)
- official example: [`examples/google-genai`](./examples/google-genai)

## Release notes

- Follow semver.
- Keep `README.md` short and landing-page focused.
- Put deep reference material in `docs/`.
- Use the publish workflow from `main` for actual releases.

## Questions and proposals

If you are planning a larger change, open an issue first so we can align on API shape and scope before you invest heavily.

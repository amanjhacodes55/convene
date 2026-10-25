# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

```bash
npm install
npm run dev            # http://localhost:3000
```

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test               # unit tests: rooms, accounts, OAuth, webhooks
npm run build && npx next start -p 3020 &
BASE=http://localhost:3020 npm run e2e   # real Chrome: a call, then the developer platform
```

The end-to-end tests need Google Chrome at `/usr/bin/google-chrome` (or set `CHROME_PATH`).

## Guidelines

- Keep media peer to peer and the server stateless apart from the store; no new long-lived connections.
- Anything secret (passwords, tokens, client secrets) is stored hashed, never in plain text.
- New API endpoints, scopes or webhook events go in `src/lib/catalog.ts`, so the docs, the portal and the
  playground pick them up, and need a scope check and a test.
- Match the surrounding code: small functions, comments that say why, no new dependencies without a reason.

## The demo video

`docs/video/demo.mjs` records the narrated walkthrough against a fresh local server, using virtual webcams
(`docs/video/persona.js`) and Kokoro text-to-speech (`docs/video/tts.py`).

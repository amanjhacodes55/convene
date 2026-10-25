# Self-hosting

## Netlify (recommended)

Convene stores everything in [Netlify Blobs](https://docs.netlify.com/blobs/overview/), which every Netlify
site has, so there is nothing to provision.

```bash
npm install
npx netlify-cli deploy --build --prod
```

Or connect the GitHub repository in the Netlify UI; `netlify.toml` already has the build settings.

## Anywhere else

```bash
npm install
npm run build
npx next start -p 3000
```

Off Netlify, the store is in memory: right for a single `next start` process, but accounts, apps and
meetings are lost on restart. To persist them elsewhere, implement the four-method `KV` interface in
[`src/lib/store.ts`](../src/lib/store.ts) (get, set, delete, list by prefix) on Redis, SQLite or similar.

Camera, microphone and screen sharing need HTTPS (or localhost).

## Configuration

| Variable | Purpose |
| --- | --- |
| `TURN_URLS` | Comma-separated TURN servers, for networks that block direct connections |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | Credentials for those TURN servers |

Without TURN, Convene uses public STUN servers, which work for most home and office networks.

## Production notes

- Webhook endpoints must be public https URLs; see [webhooks.md](webhooks.md#endpoint-rules).
- There is no built-in rate limiting on sign-in or the token endpoint; put the site behind your platform's
  rate limiting or a WAF if it is public.
- Live captions need a browser with the Web Speech API (Chrome or Edge).

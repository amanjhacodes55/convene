# REST API and OAuth

The Convene API is JSON over HTTPS at `https://<your-site>/api/v1`. Every request carries an access token
in `Authorization: Bearer <token>`, and every endpoint needs one [scope](#scopes). The same reference, with
live examples, is in the app at [`/developers/docs`](https://convene-meet.netlify.app/developers/docs), and
you can send real requests from an app's **Try the API** tab in the developer portal.

- [Apps and credentials](#apps-and-credentials)
- [OAuth apps: authorization code + PKCE](#oauth-apps)
- [Server-to-Server apps: client credentials](#server-to-server-apps)
- [Scopes](#scopes)
- [Errors](#errors)
- [Endpoints](#endpoints)

Webhooks are described in [webhooks.md](webhooks.md).

## Apps and credentials

Sign in, open **Developer → Your apps**, and create an app. You get a **client ID** and a **client secret**.
The secret is shown once and stored only as a SHA-256 hash; *Regenerate secret* replaces it.

| App type | For | Grant | Acts for |
| --- | --- | --- | --- |
| **OAuth** | Apps other people install | `authorization_code` (+ PKCE), `refresh_token` | The user who authorized it |
| **Server-to-Server** | Your own scripts and back office | `client_credentials` | The developer who owns the app |

Access tokens last one hour. Send client credentials to the token endpoint with HTTP Basic auth
(`-u client_id:client_secret`) or as `client_id` and `client_secret` form fields.

## OAuth apps

1. **Send the user to the consent screen.**

   ```
   GET /oauth/authorize?response_type=code
       &client_id=cvn_…
       &redirect_uri=https://yourapp.example/callback
       &scope=meeting:read meeting:write
       &state=<random>
       &code_challenge=<base64url(sha256(verifier))>&code_challenge_method=S256
   ```

   `redirect_uri` must exactly match one registered on the app (https, or http for localhost). If `scope` is
   left out, the app's configured scopes are requested; asking for more than the app has is refused with
   `error=invalid_scope`. The user signs in if needed and sees each scope in plain words.

2. **Receive the code.** On *Allow*, Convene redirects to `redirect_uri?code=…&state=…`; on *Cancel*, to
   `redirect_uri?error=access_denied&state=…`. Check `state`. Codes last 10 minutes and work once; replaying a
   used code revokes every token issued from it.

3. **Exchange it.**

   ```bash
   curl -X POST https://convene-meet.netlify.app/oauth/token \
     -u "$CLIENT_ID:$CLIENT_SECRET" \
     -d grant_type=authorization_code -d code=$CODE \
     -d redirect_uri=https://yourapp.example/callback -d code_verifier=$VERIFIER
   ```

   ```json
   { "access_token": "cvn_at_…", "token_type": "bearer", "expires_in": 3600,
     "scope": "meeting:read meeting:write", "refresh_token": "cvn_rt_…" }
   ```

4. **Refresh** before the hour is up. Refresh tokens rotate: each works once and the response has the next.

   ```bash
   curl -X POST https://convene-meet.netlify.app/oauth/token -u "$CLIENT_ID:$CLIENT_SECRET" \
     -d grant_type=refresh_token -d refresh_token=$REFRESH_TOKEN
   ```

5. **Revoke** a token with `POST /oauth/revoke` and `token=…` (always answers 200). When a user removes your
   app under **Connected apps**, every token it holds for them stops working and its webhooks stop.

The default redirect URI of a new OAuth app is the built-in `/developers/callback` page, so the whole flow
can be tried from the portal with **Test the install flow**.

## Server-to-Server apps

```bash
curl -X POST https://convene-meet.netlify.app/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" -d grant_type=client_credentials
```

The token acts for the app's developer with the app's scopes. There is no refresh token; ask again when it
expires.

## Scopes

| Scope | Allows |
| --- | --- |
| `user:read` | See your name and email address |
| `meeting:read` | See your meetings, their settings and attendance reports |
| `meeting:write` | Schedule, change, delete and end your meetings |
| `participant:read` | See who is in your meetings and in their waiting rooms, live |
| `chat:write` | Post messages into the chat of your live meetings |

## Errors

Errors have an HTTP status and a body with a stable `code` and a human `message`:

```json
{ "error": { "code": "insufficient_scope", "message": "This token is missing the meeting:write scope." } }
```

| Status | Codes |
| --- | --- |
| 400 | `bad_request` |
| 401 | `unauthorized` (no token), `invalid_token` (expired, revoked or unknown) |
| 403 | `insufficient_scope` |
| 404 | `not_found` (including meetings that belong to someone else) |
| 409 | `conflict` (for example, posting to a meeting nobody is in, or deleting a live one) |

The token endpoint uses the OAuth error format instead: `{ "error": "invalid_grant", "error_description": "…" }`.

## Endpoints

Meeting IDs are the codes in meeting links, such as `kfa-wqpz-tnu`. Times are ISO 8601 in UTC.

### A meeting

```json
{
  "id": "kfa-wqpz-tnu",
  "topic": "Weekly design review",
  "agenda": "Walk through the new onboarding flow.",
  "status": "waiting",
  "start_time": "2026-11-02T15:00:00.000Z",
  "duration": 45,
  "created_at": "2026-10-25T09:12:44.000Z",
  "started_at": null,
  "ended_at": null,
  "join_url": "https://convene-meet.netlify.app/m/kfa-wqpz-tnu",
  "settings": { "waiting_room": true, "locked": false }
}
```

`status` is `waiting` (nobody has joined yet), `started` or `ended`.

| Method and path | Scope | Does |
| --- | --- | --- |
| `GET /api/v1/users/me` | `user:read` | The account the token acts for |
| `GET /api/v1/meetings?status=upcoming\|live\|ended` | `meeting:read` | The account's meetings, newest first, as `{ total_records, meetings }` |
| `POST /api/v1/meetings` | `meeting:write` | Create a meeting (201). Body: `topic`, `agenda`, `start_time`, `duration` (minutes, 1–1440), `settings.waiting_room`. The response adds `host_key` and `start_url`, which opens the meeting as host on any device: keep it private |
| `GET /api/v1/meetings/{id}` | `meeting:read` | One meeting |
| `PATCH /api/v1/meetings/{id}` | `meeting:write` | Change `topic`, `agenda`, `start_time`, `duration`, `settings.waiting_room`, `settings.locked`. Settings apply to a live meeting at once |
| `DELETE /api/v1/meetings/{id}` | `meeting:write` | Delete it (204). A live meeting must be ended first (409) |
| `POST /api/v1/meetings/{id}/end` | `meeting:write` | End a live meeting for everyone |
| `GET /api/v1/meetings/{id}/participants` | `participant:read` | `{ participants, waiting }`: who is in the meeting and its waiting room now |
| `GET /api/v1/meetings/{id}/report` | `meeting:read` | Attendance: each person's `joined_at`, `left_at`, `duration` (seconds) and `reason` (`left`, `removed`, `ended`) |
| `POST /api/v1/meetings/{id}/messages` | `chat:write` | Post `{ "text": "…" }` into the live meeting's chat, labelled with your app's name (201). 409 if nobody is in it |

The API sends `Access-Control-Allow-Origin: *` and never reads cookies, so it can be called from a browser
with a token.

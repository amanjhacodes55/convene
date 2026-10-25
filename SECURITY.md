# Security

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/amanjhacodes55/convene/security/advisories/new), not in a
public issue. You'll get a reply within a few days.

## What Convene protects

- **Calls** are peer to peer and encrypted with DTLS-SRTP; audio and video never pass through the server.
  Chat and other in-call messages go over the same encrypted data channel. Messages posted by apps pass
  through the server.
- **Host powers** (admitting, removing, locking, ending) are checked on the server against a host key or the
  meeting owner's session, not just hidden in the UI.
- **Secrets**: passwords are scrypt hashes; sessions, client secrets, authorization codes, access and refresh
  tokens are stored only as SHA-256 hashes.
- **OAuth**: exact redirect URI matching, PKCE, single-use codes (a replay revokes the grant's tokens),
  rotating refresh tokens, and revocation when a user removes an app.
- **Webhooks** are signed with HMAC-SHA256 over the timestamp and body.

## Known limits

- No rate limiting on sign-in or the token endpoint.
- The webhook address check looks at the URL as written, not at what a hostname resolves to.
- The signalling store has no transactions, so two simultaneous redemptions of the same code or refresh
  token could both succeed.

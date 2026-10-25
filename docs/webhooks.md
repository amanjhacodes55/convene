# Webhooks

Convene sends an HTTP `POST` to your app's endpoint when something happens in a meeting owned by your
account or, for OAuth apps, by anyone who installed your app, as long as their grant includes the event's
scope. Set the endpoint and choose events on the app's **Webhooks** tab.

## Events

| Event | Scope | When |
| --- | --- | --- |
| `meeting.created` | `meeting:read` | A meeting was scheduled or started |
| `meeting.updated` | `meeting:read` | Its topic, time or settings changed |
| `meeting.deleted` | `meeting:read` | A meeting was deleted |
| `meeting.started` | `meeting:read` | The first participant joined |
| `meeting.ended` | `meeting:read` | The host, or the API, ended it for everyone |
| `participant.joined` | `participant:read` | Someone joined, or was admitted from the waiting room |
| `participant.left` | `participant:read` | Someone left or was removed (`participant.reason`) |
| `participant.waiting` | `participant:read` | Someone is in the waiting room |
| `meeting.registration_created` | `meeting:read` | Someone registered (`payload.registrant`) |
| `meeting.registration_approved` | `meeting:read` | The host approved a registration |
| `meeting.registration_denied` | `meeting:read` | The host declined a registration |

The **Send test event** button sends `endpoint.test`.

## The request

```http
POST /webhooks/convene HTTP/1.1
Content-Type: application/json
User-Agent: Convene-Webhooks/1.0
Convene-Event: participant.joined
Convene-Delivery: 41fce5643027793a
Convene-Signature: t=1793632812,v1=5f2b…

{
  "event": "participant.joined",
  "event_ts": 1793632812000,
  "account_id": "4f1c9a7be2d03a18",
  "payload": {
    "meeting": { "id": "kfa-wqpz-tnu", "topic": "Weekly design review", "status": "started", "join_url": "…", … },
    "participant": { "id": "0f9e8d7c6b5a4938", "name": "Leo Park", "host": false, "at": "2026-11-02T15:01:40.000Z" }
  }
}
```

`payload.meeting` has the same shape as the REST API's meeting. Use `Convene-Delivery` to skip duplicates.
Answer with any 2xx within 8 seconds.

## Verifying the signature

`v1` is the hex HMAC-SHA256 of `"<t>.<raw body>"`, keyed with the app's **signing secret** (shown, and
rotatable, on the Webhooks tab). Check it against the exact bytes you received, and refuse old timestamps.

```js
import crypto from "node:crypto";
import express from "express";

const app = express();
app.post("/webhooks/convene", express.raw({ type: "application/json" }), (req, res) => {
  const { t, v1 } = Object.fromEntries((req.get("Convene-Signature") ?? "").split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", process.env.CONVENE_WEBHOOK_SECRET).update(`${t}.${req.body}`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  if (!fresh || !v1 || v1.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(req.body);
  console.log(event.event, event.payload);
  res.sendStatus(200);
});
```

## Testing without a server

**Use a test inbox** on the Webhooks tab points your endpoint at a URL on Convene itself that records what
it receives, and shows each request with its headers, body, and whether the signature verifies against your
app's secret.

## Delivery log

Each app keeps its last 50 delivery attempts: event, status, time taken, the body sent and the first 1,000
characters of your response. Any of them can be sent again with **Redeliver**. Deliveries run after the
request that caused them has been answered, so a slow endpoint never slows down a meeting.

## Endpoint rules

Endpoints must use https. In production they also can't be loopback, private or link-local addresses; the
only exception is this site's own test inbox. The check looks at the URL as written, so if you self-host
somewhere with sensitive internal services, also restrict outbound traffic at the network level.

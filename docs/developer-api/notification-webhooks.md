# Notification Webhooks API

Bearer base: `/api/developer/v1`

Notification webhooks deliver notification snapshot payloads that include:

- notification tab items (`items`)
- badge count (`unreadCount`)

## Webhook Payload

```json
{
  "event": "notifications.snapshot",
  "generatedAt": "2026-02-25T12:34:56.000Z",
  "recipientUserId": "user_id",
  "filter": "all",
  "unreadCount": 2,
  "items": [],
  "trigger": {
    "notificationId": "...",
    "type": "follow",
    "sourceType": "follow",
    "sourceId": "..."
  }
}
```

## Signature Headers

- `X-Numatter-Event`
- `X-Numatter-Delivery-Id`
- `X-Numatter-Timestamp`
- `X-Numatter-Signature` (`sha256=<hex>`)

Signature source text:

```text
<timestamp>.<raw_json_payload>
```

HMAC algorithm: SHA-256, key = webhook secret.

## Subscription Endpoints

### GET `/api/developer/v1/notifications/webhooks`

List your webhook subscriptions.

### POST `/api/developer/v1/notifications/webhooks`

Create a subscription.

Request body:

```json
{
  "name": "Main Hook",
  "endpoint": "https://example.com/webhook",
  "isActive": true
}
```

If `secret` is omitted, server generates and returns `plainSecret` once.

### PATCH `/api/developer/v1/notifications/webhooks/:webhookId`

Update webhook fields.

Supported fields:

- `name`
- `endpoint`
- `isActive`
- `secret` (set explicit secret)
- `rotateSecret` (generate new secret)

### DELETE `/api/developer/v1/notifications/webhooks/:webhookId`

Delete a subscription.

## Manual Send Endpoint

### POST `/api/developer/v1/notifications/webhooks/send`

Send current snapshot manually.

Modes:

1. send to all active registered webhooks (empty body)
2. send to one registered webhook (`webhookId`)
3. send ad-hoc (`endpoint` + `secret`)

Request examples:

```json
{}
```

```json
{
  "webhookId": "...",
  "type": "all"
}
```

```json
{
  "endpoint": "https://example.com/webhook",
  "secret": "my-shared-secret",
  "type": "all"
}
```

## Automatic Delivery

Registered active webhooks are automatically invoked when new notifications are created (e.g. follow, like, repost, quote, system notification).

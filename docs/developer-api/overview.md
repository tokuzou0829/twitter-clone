# Developer API Overview

Developer API lets you automate actions for your own Numatter account.

Base path:

`/api/developer`

Bearer API path:

`/api/developer/v1/*`

## Authentication Flow

1. Enable developer access in Developer Portal (`/developer/link-preview`)
2. Create an API token from `/developer/api-tokens`
3. Send token as Bearer:

```text
Authorization: Bearer <plainToken>
```

## Endpoint Groups

- Authentication and Token Management
- Profile
- Posts
- Interactions (likes/reposts)
- Notifications
- Notification Webhooks

Open each page in the docs UI (`/developer/docs`) for request/response examples.

## Common Error Format

```json
{
  "error": "..."
}
```

## Common Status Codes

- `400`: validation error
- `401`: missing/invalid/expired/revoked Bearer token
- `403`: forbidden (developer access required, banned, or ownership violation)
- `404`: resource not found

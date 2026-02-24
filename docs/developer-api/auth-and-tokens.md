# Authentication and Token Management

Base path: `/api/developer`

## Session Auth Endpoints (Developer Portal)

These endpoints require normal browser session auth and developer role.

### GET `/api/developer/tokens`

List issued developer API tokens.

### POST `/api/developer/tokens`

Issue a new developer API token.

Request body:

```json
{
  "name": "CLI Token",
  "expiresInDays": 90
}
```

- `expiresInDays`: optional (`1..365`)
- `expiresInDays: null`: create non-expiring token

Response (`201`):

```json
{
  "token": {
    "id": "...",
    "name": "CLI Token",
    "tokenPrefix": "nmt_dev_..."
  },
  "plainToken": "nmt_dev_..."
}
```

`plainToken` is returned only once.

### DELETE `/api/developer/tokens/:tokenId`

Revoke a token.

## Bearer Usage

All `/api/developer/v1/*` endpoints require:

```text
Authorization: Bearer <plainToken>
```

Example:

```bash
curl -X GET "https://numatter.vercel.app/api/developer/v1/profile" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN"
```

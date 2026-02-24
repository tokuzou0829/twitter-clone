# Profile API

Bearer base: `/api/developer/v1`

## GET `/api/developer/v1/profile`

Get your profile summary and stats.

## PATCH `/api/developer/v1/profile`

Update your profile.

Request body:

```json
{
  "name": "Updated Name",
  "handle": "updated_handle",
  "bio": "Updated bio"
}
```

Rules:

- all fields are optional
- at least one field is required
- set `handle: null` or `bio: null` to clear values

Example:

```bash
curl -X PATCH "https://numatter.vercel.app/api/developer/v1/profile" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Numatter API"}'
```

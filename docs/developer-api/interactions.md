# Interactions API

Bearer base: `/api/developer/v1`

These endpoints return interaction summary:

```json
{
  "postId": "...",
  "liked": true,
  "reposted": false,
  "likes": 10,
  "reposts": 2
}
```

## Likes

- `POST /api/developer/v1/posts/:postId/likes`
- `DELETE /api/developer/v1/posts/:postId/likes`

## Reposts

- `POST /api/developer/v1/posts/:postId/reposts`
- `DELETE /api/developer/v1/posts/:postId/reposts`

Example:

```bash
curl -X POST "https://numatter.vercel.app/api/developer/v1/posts/<postId>/likes" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN"
```

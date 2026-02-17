# Developer API

Developer API enables automation for your own account operations:

- profile
- post creation/deletion
- likes
- reposts

Base path:

`/api/developer`

Versioned Bearer API path:

`/api/developer/v1/*`

## Authentication

### 1) Enable developer access

Developer access must be enabled for your account.

You can enable it from Developer Portal:

- `/developer/link-preview`
- click `開発者として登録`

Developer Portal pages:

- link preview: `/developer/link-preview`
- API tokens: `/developer/api-tokens`
- docs: `/developer/docs`

### 2) Issue an API token

Issue token from Developer Portal Token section, or via session-authenticated endpoint.
`plainToken` is shown only once and is not retrievable again.

### 3) Use Bearer token

Attach token to `Authorization` header:

```text
Authorization: Bearer <plainToken>
```

Example:

```bash
curl -X GET "https://numatter.vercel.app/api/developer/v1/profile" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN"
```

## Bearer API Endpoints

All endpoints below require `Authorization: Bearer <token>`.

### GET /api/developer/v1/profile

Get your profile summary.

### PATCH /api/developer/v1/profile

Update profile fields.

Request body (JSON):

```json
{
  "name": "Updated Name",
  "handle": "updated_handle",
  "bio": "Updated bio"
}
```

- all fields are optional
- pass `null` for `handle` or `bio` to clear values

### POST /api/developer/v1/posts

Create a post using `multipart/form-data`.

Form fields:

- `content`: string (optional)
- `images`: file[] (optional, repeatable)
- `replyToPostId`: string (optional)
- `quotePostId`: string (optional)

At least one of `content` or `images` is required.

Example:

```bash
curl -X POST "https://numatter.vercel.app/api/developer/v1/posts" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN" \
  -F "content=Hello from Developer API" \
  -F "images=@./sample.png;type=image/png"
```

### DELETE /api/developer/v1/posts/:postId

Delete your own post.

### POST /api/developer/v1/posts/:postId/likes

Like a post.

### DELETE /api/developer/v1/posts/:postId/likes

Remove like from a post.

### POST /api/developer/v1/posts/:postId/reposts

Repost a post.

### DELETE /api/developer/v1/posts/:postId/reposts

Remove repost from a post.

## Image Upload Limits

Developer API post image limits are intentionally strict by default:

- max files per post: 2
- max size per image: 3MB
- allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

You can update these values in one place:

- `server/routes/developer.ts`
- constant: `DEVELOPER_API_POST_LIMITS`

## Common Errors

- `401 Unauthorized`: missing/invalid/expired/revoked Bearer token
- `403 Forbidden`: developer access is required
- `404 Not Found`: target resource was not found
- `400 Bad Request`: validation error (invalid profile fields, image limits, etc.)

All errors follow:

```json
{
  "error": "..."
}
```

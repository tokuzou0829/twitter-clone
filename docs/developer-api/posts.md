# Posts API

Bearer base: `/api/developer/v1`

## POST `/api/developer/v1/posts`

Create a post with `multipart/form-data`.

Fields:

- `content`: string (optional)
- `images`: file[] (optional, repeatable)
- `replyToPostId`: string (optional)
- `quotePostId`: string (optional)

Rules:

- `content` or `images` is required
- `replyToPostId` and `quotePostId` cannot be set together
- `content` 内の `@handle` は投稿作成時に解決され、内部では user id で保存されます
- メンション対象には `mention` 通知が作成されます

Example:

```bash
curl -X POST "https://numatter.vercel.app/api/developer/v1/posts" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN" \
  -F "content=Hello from Developer API" \
  -F "images=@./sample.png;type=image/png"
```

## DELETE `/api/developer/v1/posts/:postId`

Delete your own post.

## Image Limits

- max images per post: `2`
- max file size: `3MB` each
- MIME types: `image/jpeg`, `image/png`, `image/webp`

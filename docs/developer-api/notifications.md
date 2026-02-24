# Notifications API

Bearer base: `/api/developer/v1`

This API provides notification tab data and badge count.

## GET `/api/developer/v1/notifications/unread-count`

Get unread badge count.

Response:

```json
{
  "count": 3
}
```

## GET `/api/developer/v1/notifications`

Get notification items.

Query parameters:

- `type` (optional): `all` | `follow` | `like` | `repost` | `quote` | `info`
- `markAsRead` (optional): `true` | `false`

Behavior:

- `markAsRead=true` only affects `type=all`
- when applied, unread notifications become read

Response:

```json
{
  "items": [
    {
      "id": "like:post_id",
      "type": "like",
      "createdAt": "2026-02-25T12:34:56.000Z",
      "actors": [],
      "actorCount": 1,
      "post": null,
      "quotePost": null,
      "title": null,
      "body": null,
      "actionUrl": "/posts/post_id"
    }
  ],
  "unreadCount": 3
}
```

Example:

```bash
curl -X GET "https://numatter.vercel.app/api/developer/v1/notifications?type=all&markAsRead=false" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN"
```

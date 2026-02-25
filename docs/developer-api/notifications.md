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

- `type` (optional): `all` | `follow` | `like` | `repost` | `reply` | `quote` | `info`
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

## GET `/api/developer/v1/notifications/:notificationId`

Get one notification detail by raw `notificationId`.

Notes:

- this endpoint does not mark notification as read
- only your own notification can be fetched (`404` for others / unknown ids)

Response:

```json
{
  "notification": {
    "id": "notification_id",
    "type": "like",
    "sourceType": "post_like",
    "sourceId": "source_id",
    "createdAt": "2026-02-25T12:34:56.000Z",
    "readAt": null,
    "title": null,
    "body": null,
    "actionUrl": "/posts/post_id",
    "actor": {
      "id": "actor_user_id",
      "name": "Alice",
      "handle": "alice",
      "image": null,
      "bio": null,
      "bannerImage": null
    },
    "post": null,
    "quotePost": null
  }
}
```

Example:

```bash
curl -X GET "https://numatter.vercel.app/api/developer/v1/notifications/$NOTIFICATION_ID" \
  -H "Authorization: Bearer $NUMATTER_DEV_TOKEN"
```

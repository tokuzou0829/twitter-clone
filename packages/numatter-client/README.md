# numatter-client

TypeScript client library for Numatter Developer API.

## Install

```bash
pnpm add numatter-client
```

## Usage

```ts
import { NumatterClient } from "numatter-client";

const client = new NumatterClient({
  baseUrl: "https://your-numatter.example.com",
  token: process.env.NUMATTER_TOKEN!,
});

const profile = await client.getProfile();

const created = await client.createPost({
  content: "Hello from numatter-client!",
});

await client.likePost((created.post as { id: string }).id);
```

## Supported APIs

- Profile: get/update
- Posts: create/get/thread/delete
- Interactions: like/unlike/repost/unrepost
- Notifications: list/unread count

All requests target `/api/developer/v1/*` with Bearer token authentication.

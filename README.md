This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Developer API

- Portal (Link Preview): `/developer/link-preview`
- Portal (API Tokens): `/developer/api-tokens`
- Docs: `/developer/docs`
- API base: `/api/developer`

For full endpoint specs and examples, see `docs/developer-api.md`.

## Maintenance CLI

Delete posts by content substring and/or author id:

```bash
pnpm posts:delete -- --contains "spam"
pnpm posts:delete -- --author-id "user_123" --apply
pnpm posts:delete -- --contains "spam" --author-id "user_123" --apply
```

- default is dry-run (no deletion)
- add `--apply` to execute deletion
- when `--contains` and `--author-id` are both specified, matching is `AND`

Ban or unban a user:

```bash
pnpm users:ban -- --user-id "user_123"
pnpm users:ban -- --user-id "user_123" --apply
pnpm users:ban -- --user-id "user_123" --unban --apply
```

- default mode is `ban`
- in `ban` mode, active sessions are deleted and developer API tokens are revoked

Ban or unban an IP/CIDR:

```bash
pnpm ips:ban -- --ip "203.0.113.10"
pnpm ips:ban -- --ip "203.0.113.0/24" --reason "abuse" --apply
pnpm ips:ban -- --ip "203.0.113.10" --unban --apply
```

- single IP input is normalized to `/32` (IPv4) or `/128` (IPv6)

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
- Portal (Notification Webhooks): `/developer/notification-webhooks`
- Docs: `/developer/docs`
- API base: `/api/developer`

For full endpoint specs and examples, open `/developer/docs` or the markdown files under `docs/developer-api/`.

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

Reset a user's password by user id:

```bash
pnpm users:password-reset -- --user-id "user_123" --new-password "TempPass123!"
NEW_PASSWORD="TempPass123!" pnpm users:password-reset -- --user-id "user_123" --new-password-env NEW_PASSWORD --apply
```

- default is dry-run (no update)
- specify exactly one of `--new-password` or `--new-password-env`
- applying reset updates credential account password hash and deletes active sessions

Ban or unban an IP/CIDR:

```bash
pnpm ips:ban -- --ip "203.0.113.10"
pnpm ips:ban -- --ip "203.0.113.0/24" --reason "abuse" --apply
pnpm ips:ban -- --ip "203.0.113.10" --unban --apply
```

- single IP input is normalized to `/32` (IPv4) or `/128` (IPv6)

Send system notifications (INFO / violation):

```bash
pnpm notifications:send -- --user-id "user_123" --title "Service update" --body "We changed the posting policy"
pnpm notifications:send -- --user-id "user_123" --user-id "user_456" --title "Service update" --body "We changed the posting policy" --apply
pnpm notifications:send -- --all --title "Maintenance" --body "Scheduled maintenance starts at 02:00 UTC" --campaign-key "maintenance_2026_02" --apply
```

- default is dry-run (no insert)
- specify either `--user-id` (repeatable) or `--all`
- `--all` excludes banned users by default (`--include-banned` to include)
- `--campaign-key` makes reruns idempotent per recipient (duplicate rows are skipped)

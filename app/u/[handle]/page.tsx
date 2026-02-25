import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { parseUserHandle } from "@/lib/user-handle";

export default async function HandleRedirectPage({
	params,
}: {
	params: Promise<{ handle: string }>;
}) {
	const { handle } = await params;
	const normalizedHandle = parseUserHandle(handle);
	if (!normalizedHandle) {
		notFound();
	}

	const [user] = await db
		.select({
			id: schema.user.id,
		})
		.from(schema.user)
		.where(
			and(
				eq(schema.user.handle, normalizedHandle),
				eq(schema.user.isBanned, false),
			),
		)
		.limit(1);

	if (!user) {
		notFound();
	}

	redirect(`/users/${user.id}`);
}

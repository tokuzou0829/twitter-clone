import { isIP } from "node:net";
import { eq, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth";
import type { Context } from "@/server/types";

export const authMiddleware = createMiddleware(async (c, next) => {
	const clientIp = resolveClientIp(c.req.raw.headers);
	if (clientIp) {
		const [matchedIpBan] = await c
			.get("db")
			.select({ id: schema.ipBans.id })
			.from(schema.ipBans)
			.where(sql`${clientIp}::inet <<= ${schema.ipBans.network}`)
			.limit(1);

		if (matchedIpBan) {
			throw new HTTPException(403, { message: "Forbidden" });
		}
	}

	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session) {
		c.set("user", null);
		c.set("session", null);
		await next();
		return;
	}

	const [currentUser] = await c
		.get("db")
		.select({
			isBanned: schema.user.isBanned,
		})
		.from(schema.user)
		.where(eq(schema.user.id, session.user.id))
		.limit(1);

	if (currentUser?.isBanned) {
		c.set("user", null);
		c.set("session", null);
		throw new HTTPException(403, { message: "Forbidden" });
	}

	c.set("user", session.user);
	c.set("session", session.session);
	await next();
});

export const getUserOrThrow = async (c: Context) => {
	const user = c.get("user");
	const session = c.get("session");

	if (!user || !session) {
		throw new HTTPException(401, { message: "Unauthorized" });
	}

	return { user, session };
};

export const getDeveloperUserOrThrow = async (c: Context) => {
	const { user } = await getUserOrThrow(c);
	const [currentUser] = await c
		.get("db")
		.select({
			isDeveloper: schema.user.isDeveloper,
		})
		.from(schema.user)
		.where(eq(schema.user.id, user.id))
		.limit(1);

	if (!currentUser?.isDeveloper) {
		throw new HTTPException(403, { message: "Developer access required" });
	}

	return { user };
};

export const resolveClientIp = (headers: Headers): string | null => {
	const candidates = [
		headers.get("cf-connecting-ip"),
		headers.get("x-real-ip"),
		extractForwardedForIp(headers.get("x-forwarded-for")),
		extractForwardedHeaderIp(headers.get("forwarded")),
	];

	for (const candidate of candidates) {
		const normalized = normalizeIp(candidate);
		if (normalized) {
			return normalized;
		}
	}

	return null;
};

const extractForwardedForIp = (headerValue: string | null): string | null => {
	if (!headerValue) {
		return null;
	}

	const [first] = headerValue
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	return first ?? null;
};

const extractForwardedHeaderIp = (
	headerValue: string | null,
): string | null => {
	if (!headerValue) {
		return null;
	}

	for (const segment of headerValue.split(",")) {
		for (const directive of segment.split(";")) {
			const [key, rawValue] = directive.split("=");
			if (!key || !rawValue) {
				continue;
			}
			if (key.trim().toLowerCase() !== "for") {
				continue;
			}

			return rawValue.trim();
		}
	}

	return null;
};

const normalizeIp = (value: string | null): string | null => {
	if (!value) {
		return null;
	}

	let candidate = value.trim();
	if (!candidate) {
		return null;
	}

	if (candidate.startsWith('"') && candidate.endsWith('"')) {
		candidate = candidate.slice(1, -1);
	}

	if (candidate.startsWith("[") && candidate.includes("]")) {
		candidate = candidate.slice(1, candidate.indexOf("]"));
	} else {
		const parts = candidate.split(":");
		if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1] ?? "")) {
			candidate = parts[0];
		}
	}

	if (candidate.includes("%")) {
		candidate = candidate.split("%")[0] ?? "";
	}

	return isIP(candidate) > 0 ? candidate : null;
};

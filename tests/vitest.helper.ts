import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { afterAll, afterEach, vi } from "vitest";
import * as schema from "@/db/schema";
import type { auth } from "@/lib/auth";

export async function setup() {
	const { container, db, truncate, down } = await vi.hoisted(async () => {
		const { setupDB } = await import("./db.setup");
		return await setupDB({ port: "random" });
	});

	const mock = vi.hoisted(() => ({
		currentUser: null as typeof auth.$Infer.Session.user | null,
		currentSession: null as typeof auth.$Infer.Session.session | null,
		authMiddleware: vi.fn(async (c, next) => {
			const forwardedFor = c.req.raw.headers.get("x-forwarded-for");
			const clientIp = forwardedFor
				? (forwardedFor
						.split(",")
						.map((value: string) => value.trim())
						.filter(Boolean)[0] ?? null)
				: null;

			if (clientIp) {
				const matchedIpBans = await db
					.select({ id: schema.ipBans.id })
					.from(schema.ipBans)
					.where(sql`${clientIp}::inet <<= ${schema.ipBans.network}`)
					.limit(1);

				if (matchedIpBans.length > 0) {
					throw new HTTPException(403, { message: "Forbidden" });
				}
			}

			if (!mock.currentUser || !mock.currentSession) {
				c.set("user", null);
				c.set("session", null);
				await next();
				return;
			}

			const [currentUser] = await db
				.select({
					isBanned: schema.user.isBanned,
				})
				.from(schema.user)
				.where(eq(schema.user.id, mock.currentUser.id))
				.limit(1);

			if (currentUser?.isBanned) {
				c.set("user", null);
				c.set("session", null);
				throw new HTTPException(403, { message: "Forbidden" });
			}

			c.set("user", mock.currentUser);
			c.set("session", mock.currentSession);
			await next();
		}),
	}));

	vi.mock("@/lib/db", async (importOriginal) => {
		const actual = await importOriginal<typeof import("@/lib/db")>();
		return {
			...actual,
			db,
		};
	});

	vi.mock("@/server/middleware/auth", async () => {
		const actual = await vi.importActual<
			typeof import("@/server/middleware/auth")
		>("@/server/middleware/auth");
		return {
			...actual,
			authMiddleware: mock.authMiddleware,
		};
	});

	afterAll(async () => {
		await down();
	});

	afterEach(async () => {
		await truncate();
		mock.currentUser = null;
		mock.currentSession = null;
	});

	async function createUser(options?: {
		isDeveloper?: boolean;
		isBanned?: boolean;
	}) {
		const isDeveloper = options?.isDeveloper ?? false;
		const isBanned = options?.isBanned ?? false;
		const user: typeof auth.$Infer.Session.user = {
			id: "test_user_id",
			name: "Test User",
			email: "test@example.com",
			image: "https://example.com/avatar.png",
			isDeveloper,
			isBanned,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
			emailVerified: true,
		};

		const session: typeof auth.$Infer.Session.session = {
			id: "test_session_id",
			userId: user.id,
			expiresAt: new Date(new Date("2026-01-01").getTime() + 1000 * 60 * 60),
			token: "test_token",
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		};
		await db.insert(schema.user).values({
			id: user.id,
			name: user.name,
			handle: user.handle ?? null,
			isDeveloper: Boolean(user.isDeveloper),
			isBanned: Boolean(user.isBanned),
			email: user.email,
			emailVerified: user.emailVerified,
			image: user.image ?? null,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		});
		await db.insert(schema.session).values(session);

		mock.currentUser = user;
		mock.currentSession = session;

		return user;
	}

	return {
		container,
		db,
		truncate,
		down,
		createUser,
		mock,
	} as const;
}

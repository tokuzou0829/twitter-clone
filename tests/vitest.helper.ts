import { uuidv7 } from "uuidv7";
import { afterAll, afterEach, vi } from "vitest";
import * as schema from "@/db/schema";
import type { auth } from "@/lib/auth";

export async function setup() {
	const { container, db, truncate, down } = await vi.hoisted(async () => {
		const { setupDB } = await import("./db.setup");
		return await setupDB({ port: "random" });
	});

	const mock = vi.hoisted(() => ({
		authMiddleware: vi.fn(async (c, next) => {
			c.set("user", null);
			c.set("session", null);
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
	});

	async function createUser() {
		const user: typeof auth.$Infer.Session.user = {
			id: "test_user_id",
			name: "Test User",
			email: "test@example.com",
			image: "https://example.com/avatar.png",
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
		await db.insert(schema.user).values(user);
		await db.insert(schema.session).values(session);

		mock.authMiddleware.mockImplementation(async (c, next) => {
			c.set("user", user);
			c.set("session", session);
			await next();
		});

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

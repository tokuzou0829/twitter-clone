import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSecureMessageWrokflow } from "@/server/applications/usecases/secure-message";
import { createHonoApp } from "@/server/create-app";
import { getUserOrThrow, resolveClientIp } from "@/server/middleware/auth";
import { createFileRepository } from "../infrastructure/repositories/file";

const secureMessageSchema = z.object({
	message: z.string().min(1).max(280),
});

const SIGNUP_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const SIGNUP_RATE_LIMIT_MAX_PER_IP = 5;
const signupRateLimitStore = new Map<
	string,
	{ count: number; resetAt: number }
>();

const app = createHonoApp()
	.get("/me", async (c) => {
		const { user, session } = await getUserOrThrow(c);

		return c.json({
			user,
			session,
		});
	})
	.post(
		"/secure-message",
		zValidator("json", secureMessageSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { message } = c.req.valid("json");
			const { client, baseUrl, bucketName } = c.get("r2");
			const fileRepository = createFileRepository(client, c.get("db"), baseUrl);
			const secureMessageWorkflow = createSecureMessageWrokflow(
				fileRepository.saveBlobFile,
				bucketName,
			);
			await secureMessageWorkflow(message, user);

			return c.json({
				message: `Hello ${user.name ?? user.email}, ${message}`,
			});
		},
	)
	.get("/hello", (c) => c.text("Hello, World!"))
	.post("/sign-up/email", async (c) => {
		const clientIp = resolveClientIp(c.req.raw.headers) ?? "unknown";
		if (isSignUpRateLimited(clientIp)) {
			throw new HTTPException(429, {
				message:
					"Too many sign-up attempts from this IP. Please try again later.",
			});
		}

		return auth.handler(c.req.raw);
	})
	.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));

export default app;

const isSignUpRateLimited = (ip: string, now = Date.now()) => {
	const current = signupRateLimitStore.get(ip);
	if (!current || now >= current.resetAt) {
		signupRateLimitStore.set(ip, {
			count: 1,
			resetAt: now + SIGNUP_RATE_LIMIT_WINDOW_MS,
		});
		return false;
	}

	if (current.count >= SIGNUP_RATE_LIMIT_MAX_PER_IP) {
		return true;
	}

	current.count += 1;
	signupRateLimitStore.set(ip, current);
	return false;
};

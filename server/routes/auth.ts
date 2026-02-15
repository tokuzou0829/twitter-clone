import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSecureMessageWrokflow } from "@/server/applications/usecases/secure-message";
import { createHonoApp } from "@/server/create-app";
import { getUserOrThrow } from "@/server/middleware/auth";
import { createFileRepository } from "../infrastructure/repositories/file";

const secureMessageSchema = z.object({
	message: z.string().min(1).max(280),
});

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
			const { client, baseUrl } = c.get("r2");
			const fileRepository = createFileRepository(client, c.get("db"), baseUrl);
			const secureMessageWorkflow = createSecureMessageWrokflow(
				fileRepository.saveBlobFile,
			);
			await secureMessageWorkflow(message, user);

			return c.json({
				message: `Hello ${user.name ?? user.email}, ${message}`,
			});
		},
	)
	.get("/hello", (c) => c.text("Hello, World!"))
	.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));

export default app;

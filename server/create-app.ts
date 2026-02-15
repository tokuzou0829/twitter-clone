import { AwsClient } from "aws4fetch";
import { env } from "hono/adapter";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { db } from "@/lib/db";
import type { HonoEnv } from "@/server/types";
import { authMiddleware } from "./middleware/auth";

const factory = () =>
	createFactory<HonoEnv>({
		initApp: (app) => {
			// R2 Client Middleware
			app.use(async (c, next) => {
				const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_S3_URL } = env(c);
				c.set("r2", {
					client: new AwsClient({
						service: "s3",
						region: "auto",
						accessKeyId: R2_ACCESS_KEY_ID,
						secretAccessKey: R2_SECRET_ACCESS_KEY,
					}),
					baseUrl: R2_S3_URL,
				});

				c.set("db", db);
				await next();
			});

			// Middleware
			app.use(secureHeaders(), authMiddleware);
		},
	});

export const createHonoApp = () => {
	return factory()
		.createApp()
		.notFound((c) => c.json({ error: "Not Found" }, 404))
		.onError((error, c) => {
			if (error instanceof HTTPException) {
				return error.res ?? c.json({ error: error.message }, error.status);
			}

			return c.json({ error: "Internal Server Error" }, 500);
		});
};

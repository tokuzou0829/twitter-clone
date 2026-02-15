import { loadEnvConfig } from "@next/env";
import { z } from "zod";

const staticEnv = z.object({
	NODE_ENV: z
		.union([
			z.literal("development"),
			z.literal("test"),
			z.literal("production"),
		])
		.default("development"),

	//better-auth
	BETTER_AUTH_URL: z.url(),
	BETTER_AUTH_SECRET: z.string().min(1),

	// for server
	DATABASE_URL: z.url(),
	R2_S3_URL: z.url(),
	R2_ACCESS_KEY_ID: z.string().min(1),
	R2_SECRET_ACCESS_KEY: z.string().min(1),
	R2_PUBLIC_URL: z.url(),

	//push notification
	NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
	VAPID_PRIVATE_KEY: z.string().min(1),
});

const runtimeEnv = z.object({});

export type Schema = z.infer<typeof schema>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = z.intersection(staticEnv, runtimeEnv);

export function config(kind: "static" | "runtime" = "static") {
	if (process.env.SKIP_ENV_VALIDATION === "true") return;

	const { combinedEnv } = loadEnvConfig(process.cwd());
	const res =
		kind === "static"
			? staticEnv.safeParse(combinedEnv)
			: runtimeEnv.safeParse(combinedEnv);

	if (res.error) {
		console.error("\x1b[31m%s\x1b[0m", "[Errors] environment variables");
		console.error(JSON.stringify(res.error.issues, null, 2));
		process.exit(1);
	}
}

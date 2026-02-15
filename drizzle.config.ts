import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { createDBUrl } from "@/server/infrastructure/utils/db";

config({ path: ".env" });

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
	schema: "./db/schema.ts",
	out: "./db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url:
			process.env.NODE_ENV === "test" || process.env.NODE_ENV === "production"
				? process.env.DATABASE_URL
				: createDBUrl({}),
	},
});

import type { AwsClient } from "aws4fetch";
import type { Schema } from "env";
import type { Context as HonoContext } from "hono";
import type { auth } from "@/lib/auth";
import type { Database } from "@/lib/db";

export type HonoEnv = {
	Bindings: Schema;
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
		r2: {
			client: AwsClient;
			baseUrl: string;
		};
		db: Database;
	};
};

export type Context = HonoContext<HonoEnv>;

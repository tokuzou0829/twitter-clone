import { hc } from "hono/client";

import type { AppType } from "@/server/hono-app";

export const apiClient = hc<AppType>("", {
	init: {
		credentials: "include",
	},
});

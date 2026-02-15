import { createHonoApp } from "@/server/create-app";
import authRoute from "@/server/routes/auth";
import notificationsRoute from "@/server/routes/notifications";

const app = createHonoApp()
	.basePath("/api")
	.route("/auth", authRoute)
	.route("/notifications", notificationsRoute);

export type AppType = typeof app;
export { app };

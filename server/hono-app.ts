import { createHonoApp } from "@/server/create-app";
import authRoute from "@/server/routes/auth";
import developerRoute from "@/server/routes/developer";
import discoverRoute from "@/server/routes/discover";
import linkPreviewsRoute from "@/server/routes/link-previews";
import notificationsRoute from "@/server/routes/notifications";
import postsRoute from "@/server/routes/posts";
import searchRoute from "@/server/routes/search";
import usersRoute from "@/server/routes/users";

const app = createHonoApp()
	.basePath("/api")
	.route("/auth", authRoute)
	.route("/developer", developerRoute)
	.route("/discover", discoverRoute)
	.route("/link-previews", linkPreviewsRoute)
	.route("/notifications", notificationsRoute)
	.route("/posts", postsRoute)
	.route("/search", searchRoute)
	.route("/users", usersRoute);

export { app };

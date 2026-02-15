import { relations } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

export const files = pgTable("files", {
	id: text("id").primaryKey().notNull(),
	bucket: varchar("bucket", { length: 255 }).notNull(),
	key: varchar("key", { length: 1024 }).notNull(),
	contentType: varchar("content_type", { length: 255 }).notNull(),
	size: bigint("size", { mode: "number" }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	handle: varchar("handle", { length: 15 }).unique(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	bio: text("bio"),
	bannerImage: text("banner_image"),
	avatarFileId: text("avatar_file_id").references(() => files.id, {
		onDelete: "set null",
	}),
	bannerFileId: text("banner_file_id").references(() => files.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const pushSubscription = pgTable(
	"push_subscription",
	{
		id: text("id").primaryKey().notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		endpoint: text("endpoint").notNull(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		expirationTime: bigint("expiration_time", { mode: "number" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("push_subscription_userId_idx").on(table.userId),
		uniqueIndex("push_subscription_userId_endpoint_idx").on(
			table.userId,
			table.endpoint,
		),
	],
);

export const posts = pgTable(
	"posts",
	{
		id: text("id").primaryKey().notNull(),
		authorId: text("author_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		content: text("content"),
		replyToPostId: text("reply_to_post_id").references(
			(): AnyPgColumn => posts.id,
			{ onDelete: "set null" },
		),
		quotePostId: text("quote_post_id").references((): AnyPgColumn => posts.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("posts_authorId_idx").on(table.authorId),
		index("posts_replyToPostId_idx").on(table.replyToPostId),
		index("posts_quotePostId_idx").on(table.quotePostId),
		index("posts_createdAt_idx").on(table.createdAt),
	],
);

export const links = pgTable(
	"links",
	{
		id: text("id").primaryKey().notNull(),
		normalizedUrl: text("normalized_url").notNull(),
		host: varchar("host", { length: 255 }).notNull(),
		displayUrl: varchar("display_url", { length: 1024 }).notNull(),
		title: text("title"),
		description: text("description"),
		imageUrl: text("image_url"),
		siteName: varchar("site_name", { length: 255 }),
		ogpFetchedAt: timestamp("ogp_fetched_at"),
		ogpNextRefreshAt: timestamp("ogp_next_refresh_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("links_normalizedUrl_idx").on(table.normalizedUrl),
		index("links_ogpNextRefreshAt_idx").on(table.ogpNextRefreshAt),
	],
);

export const postLinks = pgTable(
	"post_links",
	{
		id: text("id").primaryKey().notNull(),
		postId: text("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		linkId: text("link_id")
			.notNull()
			.references(() => links.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("post_links_postId_idx").on(table.postId),
		index("post_links_linkId_idx").on(table.linkId),
		uniqueIndex("post_links_postId_position_idx").on(
			table.postId,
			table.position,
		),
		uniqueIndex("post_links_postId_linkId_idx").on(table.postId, table.linkId),
	],
);

export const postImages = pgTable(
	"post_images",
	{
		id: text("id").primaryKey().notNull(),
		postId: text("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		fileId: text("file_id")
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("post_images_postId_idx").on(table.postId),
		index("post_images_fileId_idx").on(table.fileId),
		uniqueIndex("post_images_postId_position_idx").on(
			table.postId,
			table.position,
		),
	],
);

export const postLikes = pgTable(
	"post_likes",
	{
		id: text("id").primaryKey().notNull(),
		postId: text("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("post_likes_postId_idx").on(table.postId),
		index("post_likes_userId_idx").on(table.userId),
		uniqueIndex("post_likes_postId_userId_idx").on(table.postId, table.userId),
	],
);

export const postReposts = pgTable(
	"post_reposts",
	{
		id: text("id").primaryKey().notNull(),
		postId: text("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("post_reposts_postId_idx").on(table.postId),
		index("post_reposts_userId_idx").on(table.userId),
		uniqueIndex("post_reposts_postId_userId_idx").on(
			table.postId,
			table.userId,
		),
	],
);

export const follows = pgTable(
	"follows",
	{
		id: text("id").primaryKey().notNull(),
		followerId: text("follower_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		followingId: text("following_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("follows_followerId_idx").on(table.followerId),
		index("follows_followingId_idx").on(table.followingId),
		uniqueIndex("follows_followerId_followingId_idx").on(
			table.followerId,
			table.followingId,
		),
	],
);

export const filesRelations = relations(files, ({ many }) => ({
	postImages: many(postImages),
}));

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	pushSubscriptions: many(pushSubscription),
	posts: many(posts),
	postLikes: many(postLikes),
	postReposts: many(postReposts),
	following: many(follows, { relationName: "followerUser" }),
	followers: many(follows, { relationName: "followingUser" }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const pushSubscriptionRelations = relations(
	pushSubscription,
	({ one }) => ({
		user: one(user, {
			fields: [pushSubscription.userId],
			references: [user.id],
		}),
	}),
);

export const postsRelations = relations(posts, ({ one, many }) => ({
	author: one(user, {
		fields: [posts.authorId],
		references: [user.id],
	}),
	replyTo: one(posts, {
		fields: [posts.replyToPostId],
		references: [posts.id],
		relationName: "postReplies",
	}),
	replies: many(posts, { relationName: "postReplies" }),
	quotePost: one(posts, {
		fields: [posts.quotePostId],
		references: [posts.id],
		relationName: "postQuotes",
	}),
	quotedBy: many(posts, { relationName: "postQuotes" }),
	images: many(postImages),
	links: many(postLinks),
	likes: many(postLikes),
	reposts: many(postReposts),
}));

export const linksRelations = relations(links, ({ many }) => ({
	postLinks: many(postLinks),
}));

export const postLinksRelations = relations(postLinks, ({ one }) => ({
	post: one(posts, {
		fields: [postLinks.postId],
		references: [posts.id],
	}),
	link: one(links, {
		fields: [postLinks.linkId],
		references: [links.id],
	}),
}));

export const postImagesRelations = relations(postImages, ({ one }) => ({
	post: one(posts, {
		fields: [postImages.postId],
		references: [posts.id],
	}),
	file: one(files, {
		fields: [postImages.fileId],
		references: [files.id],
	}),
}));

export const postLikesRelations = relations(postLikes, ({ one }) => ({
	post: one(posts, {
		fields: [postLikes.postId],
		references: [posts.id],
	}),
	user: one(user, {
		fields: [postLikes.userId],
		references: [user.id],
	}),
}));

export const postRepostsRelations = relations(postReposts, ({ one }) => ({
	post: one(posts, {
		fields: [postReposts.postId],
		references: [posts.id],
	}),
	user: one(user, {
		fields: [postReposts.userId],
		references: [user.id],
	}),
}));

export const followsRelations = relations(follows, ({ one }) => ({
	follower: one(user, {
		fields: [follows.followerId],
		references: [user.id],
		relationName: "followerUser",
	}),
	following: one(user, {
		fields: [follows.followingId],
		references: [user.id],
		relationName: "followingUser",
	}),
}));

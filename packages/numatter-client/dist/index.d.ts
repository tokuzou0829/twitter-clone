export type ApiErrorResponse = {
	error: string;
};
export type NotificationFilter =
	| "all"
	| "like"
	| "repost"
	| "follow"
	| "reply"
	| "quote"
	| "mention"
	| "system"
	| "violation";
export type NumatterClientOptions = {
	baseUrl: string;
	token: string;
	fetch?: typeof fetch;
};
export type DeveloperProfile = {
	id: string;
	name: string;
	handle: string | null;
	bio: string | null;
	image: string | null;
	bannerImage: string | null;
	isDeveloper: boolean;
	createdAt: string;
	updatedAt: string;
	stats: {
		followers: number;
		following: number;
		posts: number;
	};
};
export type PostCreateInput = {
	content?: string;
	replyToPostId?: string;
	quotePostId?: string;
	images?: Blob[];
};
export declare class NumatterApiError extends Error {
	readonly status: number;
	readonly data: unknown;
	constructor(message: string, status: number, data: unknown);
}
export declare class NumatterClient {
	private readonly baseUrl;
	private readonly token;
	private readonly fetchImpl;
	constructor(options: NumatterClientOptions);
	getProfile(): Promise<DeveloperProfile>;
	updateProfile(
		input: Partial<Pick<DeveloperProfile, "name" | "handle" | "bio">>,
	): Promise<DeveloperProfile>;
	createPost(input: PostCreateInput): Promise<{
		post: unknown;
	}>;
	getPost(postId: string): Promise<{
		post: unknown;
	}>;
	getThread(postId: string): Promise<{
		post: unknown;
		conversationPath: unknown[];
		replies: unknown[];
	}>;
	deletePost(postId: string): Promise<void>;
	likePost(postId: string): Promise<unknown>;
	unlikePost(postId: string): Promise<unknown>;
	repost(postId: string): Promise<unknown>;
	unrepost(postId: string): Promise<unknown>;
	getUnreadNotificationCount(): Promise<{
		count: number;
	}>;
	getNotifications(input?: {
		type?: NotificationFilter;
		markAsRead?: boolean;
	}): Promise<{
		items: unknown[];
		unreadCount: number;
	}>;
	private request;
}
//# sourceMappingURL=index.d.ts.map

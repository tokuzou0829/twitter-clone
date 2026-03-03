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

export class NumatterApiError extends Error {
	readonly status: number;
	readonly data: unknown;

	constructor(message: string, status: number, data: unknown) {
		super(message);
		this.name = "NumatterApiError";
		this.status = status;
		this.data = data;
	}
}

export class NumatterClient {
	private readonly baseUrl: string;
	private readonly token: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: NumatterClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.token = options.token;
		this.fetchImpl = options.fetch ?? fetch;
	}

	async getProfile(): Promise<DeveloperProfile> {
		const res = await this.request<{ profile: DeveloperProfile }>(
			"GET",
			"/v1/profile",
		);
		return res.profile;
	}

	async updateProfile(
		input: Partial<Pick<DeveloperProfile, "name" | "handle" | "bio">>,
	): Promise<DeveloperProfile> {
		const res = await this.request<{ profile: DeveloperProfile }>(
			"PATCH",
			"/v1/profile",
			{
				json: input,
			},
		);
		return res.profile;
	}

	async createPost(input: PostCreateInput): Promise<{ post: unknown }> {
		const form = new FormData();
		if (input.content !== undefined) form.append("content", input.content);
		if (input.replyToPostId) form.append("replyToPostId", input.replyToPostId);
		if (input.quotePostId) form.append("quotePostId", input.quotePostId);
		for (const image of input.images ?? []) {
			form.append("images", image);
		}

		return this.request("POST", "/v1/posts", { formData: form });
	}

	getPost(postId: string): Promise<{ post: unknown }> {
		return this.request("GET", `/v1/posts/${postId}`);
	}

	getThread(
		postId: string,
	): Promise<{
		post: unknown;
		conversationPath: unknown[];
		replies: unknown[];
	}> {
		return this.request("GET", `/v1/posts/${postId}/thread`);
	}

	deletePost(postId: string): Promise<void> {
		return this.request("DELETE", `/v1/posts/${postId}`);
	}

	likePost(postId: string): Promise<unknown> {
		return this.request("POST", `/v1/posts/${postId}/likes`);
	}

	unlikePost(postId: string): Promise<unknown> {
		return this.request("DELETE", `/v1/posts/${postId}/likes`);
	}

	repost(postId: string): Promise<unknown> {
		return this.request("POST", `/v1/posts/${postId}/reposts`);
	}

	unrepost(postId: string): Promise<unknown> {
		return this.request("DELETE", `/v1/posts/${postId}/reposts`);
	}

	getUnreadNotificationCount(): Promise<{ count: number }> {
		return this.request("GET", "/v1/notifications/unread-count");
	}

	getNotifications(input?: {
		type?: NotificationFilter;
		markAsRead?: boolean;
	}): Promise<{ items: unknown[]; unreadCount: number }> {
		const params = new URLSearchParams();
		if (input?.type) params.set("type", input.type);
		if (input?.markAsRead !== undefined)
			params.set("markAsRead", String(input.markAsRead));
		const query = params.toString();
		return this.request("GET", `/v1/notifications${query ? `?${query}` : ""}`);
	}

	private async request<T>(
		method: "GET" | "POST" | "PATCH" | "DELETE",
		path: string,
		options?: { json?: unknown; formData?: FormData },
	): Promise<T> {
		const url = `${this.baseUrl}/api/developer${path}`;
		const headers = new Headers({
			Authorization: `Bearer ${this.token}`,
		});

		let body: BodyInit | undefined;
		if (options?.formData) {
			body = options.formData;
		} else if (options?.json !== undefined) {
			headers.set("content-type", "application/json");
			body = JSON.stringify(options.json);
		}

		const res = await this.fetchImpl(url, {
			method,
			headers,
			body,
		});

		if (res.status === 204) {
			return undefined as T;
		}

		const data: unknown = await res.json().catch(() => null);
		if (!res.ok) {
			const message =
				typeof data === "object" &&
				data !== null &&
				"error" in data &&
				typeof (data as ApiErrorResponse).error === "string"
					? (data as ApiErrorResponse).error
					: `Numatter API request failed (${res.status})`;

			throw new NumatterApiError(message, res.status, data);
		}

		return data as T;
	}
}

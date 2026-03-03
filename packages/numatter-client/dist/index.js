export class NumatterApiError extends Error {
	status;
	data;
	constructor(message, status, data) {
		super(message);
		this.name = "NumatterApiError";
		this.status = status;
		this.data = data;
	}
}
export class NumatterClient {
	baseUrl;
	token;
	fetchImpl;
	constructor(options) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.token = options.token;
		this.fetchImpl = options.fetch ?? fetch;
	}
	async getProfile() {
		const res = await this.request("GET", "/v1/profile");
		return res.profile;
	}
	async updateProfile(input) {
		const res = await this.request("PATCH", "/v1/profile", {
			json: input,
		});
		return res.profile;
	}
	async createPost(input) {
		const form = new FormData();
		if (input.content !== undefined) form.append("content", input.content);
		if (input.replyToPostId) form.append("replyToPostId", input.replyToPostId);
		if (input.quotePostId) form.append("quotePostId", input.quotePostId);
		for (const image of input.images ?? []) {
			form.append("images", image);
		}
		return this.request("POST", "/v1/posts", { formData: form });
	}
	getPost(postId) {
		return this.request("GET", `/v1/posts/${postId}`);
	}
	getThread(postId) {
		return this.request("GET", `/v1/posts/${postId}/thread`);
	}
	deletePost(postId) {
		return this.request("DELETE", `/v1/posts/${postId}`);
	}
	likePost(postId) {
		return this.request("POST", `/v1/posts/${postId}/likes`);
	}
	unlikePost(postId) {
		return this.request("DELETE", `/v1/posts/${postId}/likes`);
	}
	repost(postId) {
		return this.request("POST", `/v1/posts/${postId}/reposts`);
	}
	unrepost(postId) {
		return this.request("DELETE", `/v1/posts/${postId}/reposts`);
	}
	getUnreadNotificationCount() {
		return this.request("GET", "/v1/notifications/unread-count");
	}
	getNotifications(input) {
		const params = new URLSearchParams();
		if (input?.type) params.set("type", input.type);
		if (input?.markAsRead !== undefined)
			params.set("markAsRead", String(input.markAsRead));
		const query = params.toString();
		return this.request("GET", `/v1/notifications${query ? `?${query}` : ""}`);
	}
	async request(method, path, options) {
		const url = `${this.baseUrl}/api/developer${path}`;
		const headers = new Headers({
			Authorization: `Bearer ${this.token}`,
		});
		let body;
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
			return undefined;
		}
		const data = await res.json().catch(() => null);
		if (!res.ok) {
			const message =
				typeof data === "object" &&
				data !== null &&
				"error" in data &&
				typeof data.error === "string"
					? data.error
					: `Numatter API request failed (${res.status})`;
			throw new NumatterApiError(message, res.status, data);
		}
		return data;
	}
}

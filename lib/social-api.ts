export type UserSummary = {
	id: string;
	name: string;
	handle: string | null;
	image: string | null;
	bio: string | null;
	bannerImage: string | null;
};

type HashtagSummary = {
	tag: string;
	count: number;
};

export type DiscoverData = {
	trends: HashtagSummary[];
	suggestedUsers: UserSummary[];
};

type PostImageSummary = {
	id: string;
	url: string;
	position: number;
};

export type LinkSummary = {
	id: string;
	url: string;
	host: string;
	displayUrl: string;
	title: string | null;
	description: string | null;
	imageUrl: string | null;
	siteName: string | null;
	ogpFetchedAt: string | null;
	ogpNextRefreshAt: string | null;
};

type QuotePostSummary = {
	id: string;
	content: string | null;
	createdAt: string;
	author: UserSummary;
	images: PostImageSummary[];
	links: LinkSummary[];
};

export type PostSummary = {
	id: string;
	content: string | null;
	createdAt: string;
	updatedAt: string;
	replyToPostId: string | null;
	quotePostId: string | null;
	author: UserSummary;
	images: PostImageSummary[];
	links: LinkSummary[];
	quotePost: QuotePostSummary | null;
	stats: {
		likes: number;
		reposts: number;
		replies: number;
		quotes: number;
	};
	viewer: {
		liked: boolean;
		reposted: boolean;
		followingAuthor: boolean;
	};
};

export type PostDetailResponse = {
	post: PostSummary;
	conversationPath: PostSummary[];
	replies: PostSummary[];
};

export type SearchResponse = {
	query: string;
	posts: PostSummary[];
	users: UserSummary[];
	hashtags: HashtagSummary[];
};

export type TimelineItem = {
	id: string;
	type: "post" | "repost";
	createdAt: string;
	actor: UserSummary;
	post: PostSummary;
};

export type ProfileTimelineTab = "posts" | "replies" | "media" | "likes";

export type ProfileResponse = {
	user: {
		id: string;
		name: string;
		handle: string | null;
		image: string | null;
		bio: string | null;
		bannerImage: string | null;
		createdAt: string;
		updatedAt: string;
	};
	stats: {
		followers: number;
		following: number;
		posts: number;
	};
	viewer: {
		isSelf: boolean;
		isFollowing: boolean;
	};
};

export type DeveloperApiTokenSummary = {
	id: string;
	name: string;
	tokenPrefix: string;
	createdAt: string;
	expiresAt: string | null;
	lastUsedAt: string | null;
	revokedAt: string | null;
};

type PostInteractionSummary = {
	postId: string;
	liked: boolean;
	reposted: boolean;
	likes: number;
	reposts: number;
};

const JSON_HEADERS = {
	"Content-Type": "application/json",
};

export const fetchDiscoverData = async (
	viewerCacheKey?: string | null,
): Promise<DiscoverData> => {
	const query = viewerCacheKey
		? `?viewer=${encodeURIComponent(viewerCacheKey)}`
		: "";
	const response = await fetch(`/api/discover${query}`, {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as DiscoverData & {
		error?: string;
	};

	if (!response.ok) {
		throw new Error(body.error ?? "Failed to fetch discover data");
	}

	return {
		trends: body.trends ?? [],
		suggestedUsers: body.suggestedUsers ?? [],
	};
};

export const fetchTimeline = async (
	userId?: string,
	tab: ProfileTimelineTab = "posts",
): Promise<TimelineItem[]> => {
	const query = new URLSearchParams();
	if (userId) {
		query.set("userId", userId);
		query.set("tab", tab);
	}
	const queryString = query.toString();
	const path = queryString ? `/api/posts?${queryString}` : "/api/posts";
	const response = await fetch(path, {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as {
		items?: TimelineItem[];
		error?: string;
	};

	if (!response.ok) {
		throw new Error(body.error ?? "Failed to fetch timeline");
	}

	return body.items ?? [];
};

export const fetchPostDetail = async (
	postId: string,
): Promise<PostDetailResponse> => {
	const response = await fetch(`/api/posts/${postId}`, {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as PostDetailResponse & {
		error?: string;
	};

	if (!response.ok || !body.post) {
		throw new Error(body.error ?? "Failed to fetch post detail");
	}

	return {
		post: body.post,
		conversationPath: body.conversationPath ?? [],
		replies: body.replies ?? [],
	};
};

export const searchPostsAndHashtags = async (
	query: string,
): Promise<SearchResponse> => {
	const normalizedQuery = query.trim();
	const querySuffix = normalizedQuery
		? `?q=${encodeURIComponent(normalizedQuery)}`
		: "";
	const response = await fetch(`/api/search${querySuffix}`, {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as SearchResponse & {
		error?: string;
	};

	if (!response.ok) {
		throw new Error(body.error ?? "Failed to search posts");
	}

	return {
		query: body.query ?? normalizedQuery,
		posts: body.posts ?? [],
		users: body.users ?? [],
		hashtags: body.hashtags ?? [],
	};
};

export const createPost = async (formData: FormData): Promise<PostSummary> => {
	return postMultipart("/api/posts", formData);
};

export const createReply = async (
	postId: string,
	formData: FormData,
): Promise<PostSummary> => {
	return postMultipart(`/api/posts/${postId}/replies`, formData);
};

export const createQuote = async (
	postId: string,
	formData: FormData,
): Promise<PostSummary> => {
	return postMultipart(`/api/posts/${postId}/quotes`, formData);
};

export const deletePost = async (postId: string): Promise<void> => {
	const response = await fetch(`/api/posts/${postId}`, {
		method: "DELETE",
		credentials: "include",
	});

	if (response.ok) {
		return;
	}

	const body = (await response.json().catch(() => null)) as {
		error?: string;
	} | null;
	throw new Error(body?.error ?? "Failed to delete post");
};

export const toggleLike = async (
	postId: string,
	isLiked: boolean,
): Promise<PostInteractionSummary> => {
	const response = await fetch(`/api/posts/${postId}/likes`, {
		method: isLiked ? "DELETE" : "POST",
		credentials: "include",
		headers: JSON_HEADERS,
	});

	const body = (await response.json()) as PostInteractionSummary & {
		error?: string;
	};
	if (!response.ok) {
		throw new Error(body.error ?? "Failed to update like");
	}

	return body;
};

export const toggleRepost = async (
	postId: string,
	isReposted: boolean,
): Promise<PostInteractionSummary> => {
	const response = await fetch(`/api/posts/${postId}/reposts`, {
		method: isReposted ? "DELETE" : "POST",
		credentials: "include",
		headers: JSON_HEADERS,
	});

	const body = (await response.json()) as PostInteractionSummary & {
		error?: string;
	};
	if (!response.ok) {
		throw new Error(body.error ?? "Failed to update repost");
	}

	return body;
};

export const fetchUserProfile = async (
	userId: string,
): Promise<ProfileResponse> => {
	const response = await fetch(`/api/users/${userId}`, {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as ProfileResponse & { error?: string };
	if (!response.ok) {
		throw new Error(body.error ?? "Failed to fetch profile");
	}
	return body;
};

export const fetchMyProfile = async (): Promise<ProfileResponse> => {
	const response = await fetch("/api/users/me", {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as ProfileResponse & { error?: string };
	if (!response.ok) {
		throw new Error(body.error ?? "Failed to fetch profile");
	}
	return body;
};

export const updateMyProfile = async (
	formData: FormData,
): Promise<ProfileResponse> => {
	const response = await fetch("/api/users/me", {
		method: "PATCH",
		credentials: "include",
		body: formData,
	});
	const body = (await response.json()) as ProfileResponse & { error?: string };
	if (!response.ok) {
		throw new Error(body.error ?? "Failed to update profile");
	}
	return body;
};

export const registerAsDeveloper = async (): Promise<{
	isDeveloper: boolean;
}> => {
	const response = await fetch("/api/users/me/developer", {
		method: "POST",
		credentials: "include",
		headers: JSON_HEADERS,
	});
	const body = (await response.json()) as {
		isDeveloper?: boolean;
		error?: string;
	};

	if (!response.ok) {
		throw new Error(body.error ?? "Failed to register as developer");
	}

	return {
		isDeveloper: Boolean(body.isDeveloper),
	};
};

export const fetchDeveloperApiTokens = async (): Promise<
	DeveloperApiTokenSummary[]
> => {
	const response = await fetch("/api/developer/tokens", {
		credentials: "include",
		cache: "no-store",
	});
	const body = (await response.json()) as {
		tokens?: DeveloperApiTokenSummary[];
		error?: string;
	};

	if (!response.ok) {
		throw new Error(body.error ?? "Failed to fetch developer API tokens");
	}

	return body.tokens ?? [];
};

export const issueDeveloperApiToken = async (
	name: string,
	expiresInDays?: number | null,
): Promise<{
	token: DeveloperApiTokenSummary;
	plainToken: string;
}> => {
	const response = await fetch("/api/developer/tokens", {
		method: "POST",
		credentials: "include",
		headers: JSON_HEADERS,
		body: JSON.stringify({
			name,
			...(expiresInDays === undefined ? {} : { expiresInDays }),
		}),
	});
	const body = (await response.json()) as {
		token?: DeveloperApiTokenSummary;
		plainToken?: string;
		error?: string;
	};

	if (!response.ok || !body.token || !body.plainToken) {
		throw new Error(body.error ?? "Failed to create developer API token");
	}

	return {
		token: body.token,
		plainToken: body.plainToken,
	};
};

export const revokeDeveloperApiToken = async (
	tokenId: string,
): Promise<DeveloperApiTokenSummary> => {
	const response = await fetch(`/api/developer/tokens/${tokenId}`, {
		method: "DELETE",
		credentials: "include",
		headers: JSON_HEADERS,
	});
	const body = (await response.json()) as {
		token?: DeveloperApiTokenSummary;
		error?: string;
	};

	if (!response.ok || !body.token) {
		throw new Error(body.error ?? "Failed to revoke developer API token");
	}

	return body.token;
};

export const toggleFollow = async (
	userId: string,
	isFollowing: boolean,
): Promise<ProfileResponse> => {
	const response = await fetch(`/api/users/${userId}/follow`, {
		method: isFollowing ? "DELETE" : "POST",
		credentials: "include",
		headers: JSON_HEADERS,
	});
	const body = (await response.json()) as ProfileResponse & { error?: string };
	if (!response.ok) {
		throw new Error(body.error ?? "Failed to update follow status");
	}
	return body;
};

export const refreshLinkPreview = async (
	linkIds: string[],
): Promise<LinkSummary | null> => {
	const uniqueLinkIds = [...new Set(linkIds)];
	if (uniqueLinkIds.length === 0) {
		return null;
	}

	const response = await fetch("/api/link-previews/refresh", {
		method: "POST",
		credentials: "include",
		headers: JSON_HEADERS,
		body: JSON.stringify({
			linkIds: uniqueLinkIds,
		}),
	});

	const body = (await response.json()) as {
		updated?: LinkSummary | null;
		error?: string;
	};

	if (!response.ok) {
		throw new Error(body.error ?? "Failed to refresh link preview");
	}

	return body.updated ?? null;
};

export const previewLinkCard = async (url: string): Promise<LinkSummary> => {
	const response = await fetch("/api/link-previews/preview", {
		method: "POST",
		credentials: "include",
		headers: JSON_HEADERS,
		body: JSON.stringify({ url }),
	});

	const body = (await response.json()) as {
		link?: LinkSummary;
		error?: string;
	};

	if (!response.ok || !body.link) {
		throw new Error(body.error ?? "Failed to preview link card");
	}

	return body.link;
};

const postMultipart = async (path: string, formData: FormData) => {
	const response = await fetch(path, {
		method: "POST",
		credentials: "include",
		body: formData,
	});

	const body = (await response.json()) as {
		post?: PostSummary;
		error?: string;
	};
	if (!response.ok || !body.post) {
		throw new Error(body.error ?? "Failed to create post");
	}

	return body.post;
};

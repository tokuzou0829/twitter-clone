import type { PostSummary } from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";

const FALLBACK_SITE_ORIGIN = "http://localhost:3000";
const MAX_POST_OG_IMAGES = 4;
const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 140;
const POST_OG_REVALIDATE_SECONDS = 60;

type PostDetailApiResponse = {
	post?: PostSummary;
	error?: string;
};

type ImageSelection = {
	urls: string[];
	isQuoteImageFallback: boolean;
};

export type PostOgPayload = {
	post: PostSummary;
	title: string;
	description: string | null;
	handle: string;
	imageUrls: string[];
	isQuoteImageFallback: boolean;
};

export const getSiteOrigin = (): string => {
	const configuredSiteUrl = process.env.BETTER_AUTH_URL;
	if (!configuredSiteUrl) {
		return FALLBACK_SITE_ORIGIN;
	}

	try {
		return new URL(configuredSiteUrl).origin;
	} catch {
		return FALLBACK_SITE_ORIGIN;
	}
};

export const toAbsoluteUrl = (pathname: string): string => {
	return new URL(pathname, getSiteOrigin()).toString();
};

export const createPostPageUrl = (postId: string): string => {
	return toAbsoluteUrl(`/posts/${encodeURIComponent(postId)}`);
};

export const createPostOgImageUrl = (
	post: Pick<PostSummary, "id" | "updatedAt">,
): string => {
	const encodedUpdatedAt = encodeURIComponent(post.updatedAt);
	return toAbsoluteUrl(
		`/posts/${encodeURIComponent(post.id)}/opengraph-image?v=${encodedUpdatedAt}`,
	);
};

export const fetchPostForOg = async (
	postId: string,
): Promise<PostSummary | null> => {
	if (!postId) {
		return null;
	}

	const response = await fetch(
		toAbsoluteUrl(`/api/posts/${encodeURIComponent(postId)}`),
		{
			next: {
				revalidate: POST_OG_REVALIDATE_SECONDS,
			},
		},
	).catch(() => null);

	if (!response || !response.ok) {
		return null;
	}

	const body = (await response
		.json()
		.catch(() => null)) as PostDetailApiResponse | null;
	if (!body?.post) {
		return null;
	}

	return body.post;
};

export const buildPostOgPayload = (post: PostSummary): PostOgPayload => {
	const normalizedContent = normalizeText(post.content);
	const imageSelection = selectPreviewImages(post);
	const handle = createDisplayHandle({
		handle: post.author.handle,
		name: post.author.name,
		userId: post.author.id,
	});

	return {
		post,
		title: buildTitle(post.author.name, normalizedContent),
		description: buildDescription({
			post,
			content: normalizedContent,
			imageSelection,
		}),
		handle,
		imageUrls: imageSelection.urls,
		isQuoteImageFallback: imageSelection.isQuoteImageFallback,
	};
};

const buildTitle = (authorName: string, content: string | null) => {
	if (content) {
		return truncateText(content, MAX_TITLE_LENGTH);
	}

	const trimmedAuthorName = authorName.trim();
	if (trimmedAuthorName) {
		return `${trimmedAuthorName}さんの投稿`;
	}

	return "投稿";
};

const buildDescription = (params: {
	post: PostSummary;
	content: string | null;
	imageSelection: ImageSelection;
}) => {
	const { content, imageSelection, post } = params;
	if (content) {
		return truncateText(content, MAX_DESCRIPTION_LENGTH);
	}

	if (imageSelection.urls.length > 0) {
		return null;
	}

	const quoteContent = normalizeText(post.quotePost?.content);
	if (quoteContent) {
		return truncateText(quoteContent, MAX_DESCRIPTION_LENGTH);
	}

	return null;
};

const selectPreviewImages = (post: PostSummary): ImageSelection => {
	const directImages = toSortedImageUrls(post.images);
	if (directImages.length > 0) {
		return {
			urls: directImages.slice(0, MAX_POST_OG_IMAGES),
			isQuoteImageFallback: false,
		};
	}

	const quoteImages = toSortedImageUrls(post.quotePost?.images ?? []);
	if (quoteImages.length > 0) {
		return {
			urls: quoteImages.slice(0, MAX_POST_OG_IMAGES),
			isQuoteImageFallback: true,
		};
	}

	return {
		urls: [],
		isQuoteImageFallback: false,
	};
};

const toSortedImageUrls = (
	images: Array<{ position: number; url: string }>,
): string[] => {
	const sortedImages = [...images].sort((a, b) => a.position - b.position);
	const urls: string[] = [];
	const seen = new Set<string>();

	for (const image of sortedImages) {
		const normalizedUrl = toHttpUrl(image.url);
		if (!normalizedUrl || seen.has(normalizedUrl)) {
			continue;
		}

		seen.add(normalizedUrl);
		urls.push(normalizedUrl);
	}

	return urls;
};

const toHttpUrl = (value: string): string | null => {
	try {
		const parsedUrl = new URL(value, toAbsoluteUrl("/"));
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			return null;
		}

		return parsedUrl.toString();
	} catch {
		return null;
	}
};

const normalizeText = (value: string | null | undefined): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return null;
	}

	return normalized;
};

const truncateText = (value: string, maxLength: number): string => {
	if (value.length <= maxLength) {
		return value;
	}

	if (maxLength <= 3) {
		return value.slice(0, maxLength);
	}

	return `${value.slice(0, maxLength - 3).trimEnd()}...`;
};

import type { Metadata } from "next";

import { PostDetailPage } from "@/components/post-detail-page";
import {
	buildPostOgPayload,
	createPostOgImageUrl,
	createPostPageUrl,
	fetchPostForOg,
} from "./post-og";

type PostDetailRouteParams = {
	postId: string;
};

type PostDetailRouteProps = {
	params: Promise<PostDetailRouteParams>;
};

const FALLBACK_METADATA: Metadata = {
	title: "投稿 | Numatter",
	description: "Numatterの投稿ページです。",
};

export async function generateMetadata({
	params,
}: PostDetailRouteProps): Promise<Metadata> {
	const { postId } = await params;
	if (!postId) {
		return FALLBACK_METADATA;
	}

	const post = await fetchPostForOg(postId);
	if (!post) {
		return FALLBACK_METADATA;
	}

	const payload = buildPostOgPayload(post);
	const postUrl = createPostPageUrl(post.id);
	const ogImageUrl = createPostOgImageUrl(post);
	const description = payload.description;

	return {
		title: payload.title,
		...(description ? { description } : {}),
		alternates: {
			canonical: postUrl,
		},
		openGraph: {
			title: payload.title,
			...(description ? { description } : {}),
			url: postUrl,
			type: "article",
			siteName: "Numatter",
			locale: "ja_JP",
			publishedTime: post.createdAt,
			modifiedTime: post.updatedAt,
			images: [
				{
					url: ogImageUrl,
					width: 1200,
					height: 630,
					alt: `${post.author.name}さんの投稿プレビュー`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: payload.title,
			...(description ? { description } : {}),
			images: [ogImageUrl],
		},
	};
}

export default async function PostDetailRoute({
	params,
}: PostDetailRouteProps) {
	const { postId } = await params;

	if (!postId) {
		return null;
	}

	return <PostDetailPage postId={postId} />;
}

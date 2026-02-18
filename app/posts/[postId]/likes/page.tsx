import { PostLikeListPage } from "@/components/post-like-list-page";

export default async function PostLikesPage({
	params,
}: {
	params: Promise<{ postId: string }>;
}) {
	const { postId } = await params;

	if (!postId) {
		return null;
	}

	return <PostLikeListPage postId={postId} />;
}

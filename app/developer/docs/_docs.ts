import { readFile } from "node:fs/promises";
import path from "node:path";

type DeveloperDocPage = {
	slug: string;
	title: string;
	description: string;
	category: string;
	fileName: string;
};

const DOCS_DIRECTORY = path.join(process.cwd(), "docs", "developer-api");

export const DEVELOPER_DOC_PAGES: DeveloperDocPage[] = [
	{
		slug: "overview",
		title: "Overview",
		description: "Developer APIの全体像と利用開始手順",
		category: "Getting Started",
		fileName: "overview.md",
	},
	{
		slug: "auth-and-tokens",
		title: "Authentication & Tokens",
		description: "開発者トークンの発行、失効、Bearer認証",
		category: "Core APIs",
		fileName: "auth-and-tokens.md",
	},
	{
		slug: "profile",
		title: "Profile",
		description: "プロフィール取得と更新",
		category: "Core APIs",
		fileName: "profile.md",
	},
	{
		slug: "posts",
		title: "Posts",
		description: "投稿作成・削除と画像アップロード制約",
		category: "Core APIs",
		fileName: "posts.md",
	},
	{
		slug: "interactions",
		title: "Interactions",
		description: "いいね・リポストの付与と解除",
		category: "Core APIs",
		fileName: "interactions.md",
	},
	{
		slug: "notifications",
		title: "Notifications",
		description: "通知タブ内容と未読バッジ件数",
		category: "Notifications",
		fileName: "notifications.md",
	},
	{
		slug: "notification-webhooks",
		title: "Notification Webhooks",
		description: "通知スナップショットのWebhook送信と購読管理",
		category: "Notifications",
		fileName: "notification-webhooks.md",
	},
];

const DOC_PAGE_BY_SLUG = new Map(
	DEVELOPER_DOC_PAGES.map((docPage) => [docPage.slug, docPage]),
);

const getDeveloperDocPageBySlug = (slug: string) => {
	return DOC_PAGE_BY_SLUG.get(slug) ?? null;
};

export const loadDeveloperDocMarkdown = async (slug: string) => {
	const docPage = getDeveloperDocPageBySlug(slug);
	if (!docPage) {
		return null;
	}

	const filePath = path.join(DOCS_DIRECTORY, docPage.fileName);
	try {
		const markdown = await readFile(filePath, "utf-8");
		return {
			docPage,
			markdown,
		};
	} catch {
		return {
			docPage,
			markdown: [
				`# ${docPage.title}`,
				"",
				"ドキュメントの読み込みに失敗しました。",
			].join("\n"),
		};
	}
};

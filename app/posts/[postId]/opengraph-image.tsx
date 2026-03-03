/* biome-ignore-all lint/performance/noImgElement: next/og image rendering requires img tags. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { buildPostOgPayload, fetchPostForOg, toAbsoluteUrl } from "./post-og";

export const alt = "Post preview";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";
export const runtime = "nodejs";

type OpenGraphImageProps = {
	params: Promise<{ postId: string }>;
};

const CARD_TEXT_MAX_LENGTH = 180;

const mplusFontPath = path.join(
	process.cwd(),
	"app/posts/[postId]/fonts/MPLUS1p-Regular.ttf",
);

const mplusFontDataPromise = readFile(mplusFontPath).then(
	(fontBuffer) =>
		fontBuffer.buffer.slice(
			fontBuffer.byteOffset,
			fontBuffer.byteOffset + fontBuffer.byteLength,
		) as ArrayBuffer,
);

const loadFallbackFonts = async () => {
	const mplusFontData = await mplusFontDataPromise;
	return [
		{
			name: "M PLUS 1p",
			data: mplusFontData,
			style: "normal" as const,
			weight: 400 as const,
		},
		{
			name: "M PLUS 1p",
			data: mplusFontData,
			style: "normal" as const,
			weight: 700 as const,
		},
	];
};

const containsRtl = (value: string | null | undefined): boolean => {
	if (!value) return false;
	return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(
		value,
	);
};

const createImageResponseSafe = async (
	node: ReactElement,
	fonts?: {
		name: string;
		data: ArrayBuffer;
		style: "normal";
		weight: 400 | 700;
	}[],
) => {
	try {
		return new ImageResponse(node, {
			...size,
			...(fonts ? { fonts } : {}),
		});
	} catch {
		return new ImageResponse(node, {
			...size,
		});
	}
};

const POOP_QUOTES = [
	"うんこは急がず、流れに乗る。",
	"つらい日は、いったん出して寝る。",
	"完璧より快便。",
	"詰まったら、水を飲んで深呼吸。",
	"人生の重みは、だいたい腸から来る。",
	"今日の運勢: うんを味方につけろ。",
	"出る日は正義、出ない日は戦略。",
	"焦るな、腸は気分屋。",
	"いいアイデアはトイレで生まれる。",
	"流した後こそ、心は軽い。",
];

const pickPoopQuote = () =>
	POOP_QUOTES[Math.floor(Math.random() * POOP_QUOTES.length)] ?? POOP_QUOTES[0];

const renderRtlFallbackCard = () => {
	const quote = pickPoopQuote();
	return (
		<div
			style={{
				display: "flex",
				width: "100%",
				height: "100%",
				backgroundColor: "#ecf3ff",
				padding: 24,
			}}
		>
			<div
				style={{
					display: "flex",
					width: "100%",
					height: "100%",
					borderRadius: 26,
					backgroundColor: "#ffffff",
					border: "2px solid #d8e5ff",
					alignItems: "center",
					justifyContent: "center",
					color: "#1a2740",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						maxWidth: 920,
						padding: "0 24px",
					}}
				>
					<div style={{ display: "flex", fontSize: 170, lineHeight: 1 }}>
						💩
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 8,
							fontSize: 30,
							fontWeight: 700,
							color: "#13223b",
						}}
					>
						この投稿はプレビューできません。
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 12,
							fontSize: 26,
							lineHeight: 1.4,
							fontWeight: 500,
							color: "#334155",
							textAlign: "center",
						}}
					>
						{quote}
					</div>
				</div>
			</div>
		</div>
	);
};

export default async function OpenGraphImage({ params }: OpenGraphImageProps) {
	const { postId } = await params;
	const post = await fetchPostForOg(postId);

	if (!post) {
		return createImageResponseSafe(
			<div
				style={{
					display: "flex",
					width: "100%",
					height: "100%",
					backgroundColor: "#ecf3ff",
					padding: 24,
				}}
			>
				<div
					style={{
						display: "flex",
						width: "100%",
						height: "100%",
						borderRadius: 26,
						backgroundColor: "#ffffff",
						border: "2px solid #d8e5ff",
						alignItems: "flex-start",
						justifyContent: "flex-start",
					}}
				/>
			</div>,
		);
	}

	const payload = buildPostOgPayload(post);
	const authorImageUrl = normalizeImageUrl(post.author.image);
	const postContent = normalizeText(post.content);
	const quoteContent = normalizeText(post.quotePost?.content);
	const hasImages = payload.imageUrls.length > 0;
	const postTextSource = hasImages
		? postContent
		: (postContent ?? quoteContent);
	const postText = postTextSource
		? truncateText(postTextSource, CARD_TEXT_MAX_LENGTH)
		: null;
	const textsForDetection = [
		post.author.name,
		payload.handle,
		postContent,
		quoteContent,
		postText,
	];
	if (textsForDetection.some((text) => containsRtl(text))) {
		const fallbackFonts = await loadFallbackFonts().catch(() => undefined);
		return createImageResponseSafe(renderRtlFallbackCard(), fallbackFonts);
	}

	return createImageResponseSafe(
		<div
			style={{
				display: "flex",
				width: "100%",
				height: "100%",
				backgroundColor: "#ecf3ff",
				padding: 24,
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					borderRadius: 26,
					backgroundColor: "#ffffff",
					border: "2px solid #d8e5ff",
					padding: "26px 30px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
					}}
				>
					<div
						style={{
							display: "flex",
							width: 68,
							height: 68,
							borderRadius: 9999,
							backgroundColor: "#1c3f77",
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
							fontSize: 30,
							fontWeight: 700,
							color: "#ffffff",
						}}
					>
						{authorImageUrl ? (
							<img
								src={authorImageUrl}
								alt={post.author.name}
								style={{
									width: "100%",
									height: "100%",
									objectFit: "cover",
								}}
							/>
						) : (
							getAvatarLabel(post.author.name)
						)}
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							marginLeft: 14,
							maxWidth: 660,
						}}
					>
						<div
							style={{
								display: "flex",
								fontSize: 34,
								fontWeight: 700,
								color: "#13223b",
							}}
						>
							{truncateText(post.author.name, 36)}
						</div>
						<div
							style={{
								display: "flex",
								marginTop: 3,
								fontSize: 22,
								fontWeight: 500,
								color: "#5b6c88",
							}}
						>
							{payload.handle}
						</div>
					</div>
				</div>

				{postText ? (
					<div
						style={{
							display: "flex",
							marginTop: 16,
							fontSize: hasImages ? 30 : 34,
							lineHeight: 1.35,
							fontWeight: 500,
							color: "#1a2740",
							wordBreak: "break-word",
						}}
					>
						{postText}
					</div>
				) : null}

				{hasImages ? (
					<div
						style={{
							display: "flex",
							flex: 1,
							marginTop: postText ? 16 : 12,
						}}
					>
						<PostImageGrid imageUrls={payload.imageUrls} />
					</div>
				) : null}
			</div>
		</div>,
	);
}

type PostImageGridProps = {
	imageUrls: string[];
};

const PostImageGrid = ({ imageUrls }: PostImageGridProps) => {
	const [first, second, third, fourth] = imageUrls;

	if (imageUrls.length === 1 && first) {
		return (
			<div style={singleImageLayoutStyle}>{renderImageTile(first, 0)}</div>
		);
	}

	if (imageUrls.length === 2 && first && second) {
		return (
			<div style={twoImageLayoutStyle}>
				{renderImageTile(first, 0)}
				{renderImageTile(second, 1)}
			</div>
		);
	}

	if (imageUrls.length === 3 && first && second && third) {
		return (
			<div style={threeImageLayoutStyle}>
				<div style={{ display: "flex", flex: 1.3 }}>
					{renderImageTile(first, 0)}
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						gap: 12,
					}}
				>
					{renderImageTile(second, 1)}
					{renderImageTile(third, 2)}
				</div>
			</div>
		);
	}

	if (first && second && third && fourth) {
		return (
			<div style={fourImageLayoutStyle}>
				<div style={splitColumnStyle}>
					{renderImageTile(first, 0)}
					{renderImageTile(second, 1)}
				</div>
				<div style={splitColumnStyle}>
					{renderImageTile(third, 2)}
					{renderImageTile(fourth, 3)}
				</div>
			</div>
		);
	}

	return (
		<div style={singleImageLayoutStyle}>
			{imageUrls.slice(0, 1).map((url, index) => renderImageTile(url, index))}
		</div>
	);
};

const renderImageTile = (url: string, index: number) => {
	return (
		<div key={`${url}-${index}`} style={imageTileStyle}>
			<img
				src={url}
				alt={`Post media ${index + 1}`}
				style={{
					width: "100%",
					height: "100%",
					objectFit: "cover",
				}}
			/>
		</div>
	);
};

const imageTileStyle = {
	display: "flex",
	flex: 1,
	borderRadius: 18,
	overflow: "hidden",
	backgroundColor: "#dce5f2",
};

const singleImageLayoutStyle = {
	display: "flex",
	flex: 1,
};

const twoImageLayoutStyle = {
	display: "flex",
	flex: 1,
	gap: 12,
};

const threeImageLayoutStyle = {
	display: "flex",
	flex: 1,
	gap: 12,
};

const fourImageLayoutStyle = {
	display: "flex",
	flex: 1,
	gap: 12,
};

const splitColumnStyle = {
	display: "flex",
	flexDirection: "column" as const,
	flex: 1,
	gap: 12,
};

const normalizeImageUrl = (value: string | null | undefined): string | null => {
	if (!value) {
		return null;
	}

	try {
		const normalizedUrl = new URL(value, toAbsoluteUrl("/")).toString();
		const parsed = new URL(normalizedUrl);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}

		return normalizedUrl;
	} catch {
		return null;
	}
};

const getAvatarLabel = (name: string): string => {
	const normalizedName = name.trim();
	if (!normalizedName) {
		return "N";
	}

	return normalizedName.slice(0, 1).toUpperCase();
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

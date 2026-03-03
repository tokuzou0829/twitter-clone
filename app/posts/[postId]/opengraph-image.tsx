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

const arabicFontPath = path.join(
	process.cwd(),
	"app/posts/[postId]/fonts/NotoSansArabic-Regular.ttf",
);

const arabicFontDataPromise = readFile(arabicFontPath);

const getOgFonts = async () => {
	const arabicFontBuffer = await arabicFontDataPromise;
	const arabicFontData = arabicFontBuffer.buffer.slice(
		arabicFontBuffer.byteOffset,
		arabicFontBuffer.byteOffset + arabicFontBuffer.byteLength,
	) as ArrayBuffer;
	return [
		{
			name: "Noto Sans Arabic",
			data: arabicFontData,
			style: "normal" as const,
			weight: 400 as const,
		},
		{
			name: "Noto Sans Arabic",
			data: arabicFontData,
			style: "normal" as const,
			weight: 500 as const,
		},
		{
			name: "Noto Sans Arabic",
			data: arabicFontData,
			style: "normal" as const,
			weight: 700 as const,
		},
	];
};

const containsArabic = (value: string | null | undefined): boolean => {
	if (!value) return false;
	return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(
		value,
	);
};

const containsRtl = (value: string | null | undefined): boolean => {
	if (!value) return false;
	return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(
		value,
	);
};

const resolveOgFonts = async (texts: Array<string | null | undefined>) => {
	if (!texts.some((text) => containsArabic(text))) {
		return undefined;
	}
	try {
		return await getOgFonts();
	} catch {
		return undefined;
	}
};

const createImageResponseSafe = async (
	node: ReactElement,
	texts: Array<string | null | undefined>,
) => {
	const fonts = await resolveOgFonts(texts);
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

const renderRtlFallbackCard = () => (
	<div
		style={{
			display: "flex",
			width: "100%",
			height: "100%",
			background:
				"linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #312e81 100%)",
			padding: 30,
		}}
	>
		<div
			style={{
				display: "flex",
				width: "100%",
				height: "100%",
				borderRadius: 28,
				border: "2px solid rgba(255,255,255,0.25)",
				backgroundColor: "rgba(15,23,42,0.65)",
				alignItems: "center",
				justifyContent: "center",
				color: "#ffffff",
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				<div style={{ display: "flex", fontSize: 170, lineHeight: 1 }}>💩</div>
				<div
					style={{
						display: "flex",
						marginTop: 12,
						fontSize: 34,
						fontWeight: 700,
						letterSpacing: 0.5,
					}}
				>
					RTL preview fallback
				</div>
			</div>
		</div>
	</div>
);

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
			[],
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
		return createImageResponseSafe(renderRtlFallbackCard(), []);
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
		textsForDetection,
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

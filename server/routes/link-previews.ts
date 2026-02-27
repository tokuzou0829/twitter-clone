import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import * as schema from "@/db/schema";
import {
	getDeveloperUserOrThrow,
	getUserOrThrow,
} from "@/server/middleware/auth";
import { createHonoApp } from "../create-app";

const OGP_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const OGP_RETRY_INTERVAL_MS = 60 * 60 * 1000;
const OGP_TIMEOUT_MS = 5_000;
const OGP_HTML_MAX_LENGTH = 1_500_000;
const MAX_REFRESH_LINK_IDS = 100;

type YouTubeOEmbedResponse = {
	title?: string;
	thumbnail_url?: string;
	provider_name?: string;
};

const refreshRequestSchema = z.object({
	linkIds: z.array(z.string().min(1)).max(MAX_REFRESH_LINK_IDS),
});

const previewRequestSchema = z.object({
	url: z.string().trim().url().max(2_048),
});

const resolveRequestSchema = z.object({
	url: z.string().trim().url().max(2_048),
});

const linkSummarySelection = {
	id: schema.links.id,
	normalizedUrl: schema.links.normalizedUrl,
	host: schema.links.host,
	displayUrl: schema.links.displayUrl,
	title: schema.links.title,
	description: schema.links.description,
	imageUrl: schema.links.imageUrl,
	siteName: schema.links.siteName,
	ogpFetchedAt: schema.links.ogpFetchedAt,
	ogpNextRefreshAt: schema.links.ogpNextRefreshAt,
};

const app = createHonoApp()
	.post("/refresh", zValidator("json", refreshRequestSchema), async (c) => {
		const { linkIds } = c.req.valid("json");
		const uniqueLinkIds = [...new Set(linkIds)];

		if (uniqueLinkIds.length === 0) {
			return c.json({ updated: null });
		}

		const db = c.get("db");
		const linkRows = await db
			.select(linkSummarySelection)
			.from(schema.links)
			.where(inArray(schema.links.id, uniqueLinkIds));

		if (linkRows.length === 0) {
			return c.json({ updated: null });
		}

		const linkById = new Map(linkRows.map((linkRow) => [linkRow.id, linkRow]));
		const now = new Date();
		const targetLink = uniqueLinkIds
			.map((linkId) => linkById.get(linkId))
			.find((linkRow) => {
				if (!linkRow) {
					return false;
				}

				return !linkRow.ogpNextRefreshAt || linkRow.ogpNextRefreshAt <= now;
			});

		if (!targetLink) {
			return c.json({ updated: null });
		}

		let preview: {
			title: string | null;
			description: string | null;
			imageUrl: string | null;
			siteName: string | null;
		};

		try {
			preview = await fetchOpenGraphPreview(targetLink.normalizedUrl);
		} catch {
			const retryAt = new Date(now.getTime() + OGP_RETRY_INTERVAL_MS);
			await db
				.update(schema.links)
				.set({
					ogpNextRefreshAt: retryAt,
					updatedAt: now,
				})
				.where(eq(schema.links.id, targetLink.id));

			return c.json({ updated: null });
		}

		const nextRefreshAt = new Date(now.getTime() + OGP_REFRESH_INTERVAL_MS);
		const [updatedLink] = await db
			.update(schema.links)
			.set({
				title: preview.title,
				description: preview.description,
				imageUrl: preview.imageUrl,
				siteName: preview.siteName,
				ogpFetchedAt: now,
				ogpNextRefreshAt: nextRefreshAt,
				updatedAt: now,
			})
			.where(eq(schema.links.id, targetLink.id))
			.returning(linkSummarySelection);

		if (!updatedLink) {
			return c.json({ updated: null });
		}

		return c.json({
			updated: toLinkSummary(updatedLink),
		});
	})
	.post("/resolve", zValidator("json", resolveRequestSchema), async (c) => {
		await getUserOrThrow(c);

		const { url } = c.req.valid("json");
		let normalizedUrl: string;
		try {
			normalizedUrl = normalizePreviewUrl(url);
		} catch (error) {
			if (error instanceof Error) {
				throw new HTTPException(400, { message: error.message });
			}
			throw new HTTPException(400, { message: "Invalid URL" });
		}

		const db = c.get("db");
		const parsedUrl = new URL(normalizedUrl);
		const now = new Date();
		const [existingLink] = await db
			.select(linkSummarySelection)
			.from(schema.links)
			.where(eq(schema.links.normalizedUrl, normalizedUrl))
			.limit(1);

		if (
			existingLink &&
			existingLink.ogpNextRefreshAt &&
			existingLink.ogpNextRefreshAt > now
		) {
			return c.json({
				link: toLinkSummary(existingLink),
			});
		}

		let preview: {
			title: string | null;
			description: string | null;
			imageUrl: string | null;
			siteName: string | null;
		};

		try {
			preview = await fetchOpenGraphPreview(normalizedUrl);
		} catch {
			if (existingLink) {
				return c.json({
					link: toLinkSummary(existingLink),
				});
			}

			return c.json({
				link: {
					id: `preview-${normalizedUrl}`,
					url: normalizedUrl,
					host: parsedUrl.host,
					displayUrl: createDisplayUrl(parsedUrl),
					title: null,
					description: null,
					imageUrl: null,
					siteName: null,
					ogpFetchedAt: null,
					ogpNextRefreshAt: null,
				},
			});
		}

		const nextRefreshAt = new Date(now.getTime() + OGP_REFRESH_INTERVAL_MS);
		const [savedLink] = await db
			.insert(schema.links)
			.values({
				id: uuidv7(),
				normalizedUrl,
				host: parsedUrl.host,
				displayUrl: createDisplayUrl(parsedUrl),
				title: preview.title,
				description: preview.description,
				imageUrl: preview.imageUrl,
				siteName: preview.siteName,
				ogpFetchedAt: now,
				ogpNextRefreshAt: nextRefreshAt,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: schema.links.normalizedUrl,
				set: {
					host: parsedUrl.host,
					displayUrl: createDisplayUrl(parsedUrl),
					title: preview.title,
					description: preview.description,
					imageUrl: preview.imageUrl,
					siteName: preview.siteName,
					ogpFetchedAt: now,
					ogpNextRefreshAt: nextRefreshAt,
					updatedAt: now,
				},
			})
			.returning(linkSummarySelection);

		if (!savedLink) {
			throw new Error("Failed to save link preview");
		}

		return c.json({
			link: toLinkSummary(savedLink),
		});
	})
	.post("/preview", zValidator("json", previewRequestSchema), async (c) => {
		await getDeveloperUserOrThrow(c);

		const { url } = c.req.valid("json");
		let normalizedUrl: string;
		try {
			normalizedUrl = normalizePreviewUrl(url);
		} catch (error) {
			if (error instanceof Error) {
				throw new HTTPException(400, { message: error.message });
			}
			throw new HTTPException(400, { message: "Invalid URL" });
		}

		const preview = await fetchOpenGraphPreview(normalizedUrl).catch(() => {
			throw new HTTPException(502, {
				message: "Failed to fetch link preview",
			});
		});

		const parsedUrl = new URL(normalizedUrl);
		const now = new Date();
		const nextRefreshAt = new Date(now.getTime() + OGP_REFRESH_INTERVAL_MS);
		const [savedLink] = await c
			.get("db")
			.insert(schema.links)
			.values({
				id: uuidv7(),
				normalizedUrl,
				host: parsedUrl.host,
				displayUrl: createDisplayUrl(parsedUrl),
				title: preview.title,
				description: preview.description,
				imageUrl: preview.imageUrl,
				siteName: preview.siteName,
				ogpFetchedAt: now,
				ogpNextRefreshAt: nextRefreshAt,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: schema.links.normalizedUrl,
				set: {
					host: parsedUrl.host,
					displayUrl: createDisplayUrl(parsedUrl),
					title: preview.title,
					description: preview.description,
					imageUrl: preview.imageUrl,
					siteName: preview.siteName,
					ogpFetchedAt: now,
					ogpNextRefreshAt: nextRefreshAt,
					updatedAt: now,
				},
			})
			.returning(linkSummarySelection);

		if (!savedLink) {
			throw new Error("Failed to save link preview");
		}

		return c.json({
			link: toLinkSummary(savedLink),
		});
	});

export default app;

const normalizePreviewUrl = (value: string) => {
	const url = assertSupportedHttpUrl(value);
	url.hash = "";
	url.hostname = url.hostname.toLowerCase();

	if (
		(url.protocol === "https:" && url.port === "443") ||
		(url.protocol === "http:" && url.port === "80")
	) {
		url.port = "";
	}

	if (url.pathname.length > 1) {
		url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
	}

	return url.toString();
};

const createDisplayUrl = (url: URL) => {
	const displayPath = `${url.pathname}${url.search}`;
	const withoutProtocol = `${url.host}${displayPath === "/" ? "" : displayPath}`;
	if (withoutProtocol.length <= 80) {
		return withoutProtocol;
	}

	return `${withoutProtocol.slice(0, 77)}...`;
};

const toLinkSummary = (link: {
	id: string;
	normalizedUrl: string;
	host: string;
	displayUrl: string;
	title: string | null;
	description: string | null;
	imageUrl: string | null;
	siteName: string | null;
	ogpFetchedAt: Date | null;
	ogpNextRefreshAt: Date | null;
}) => {
	return {
		id: link.id,
		url: link.normalizedUrl,
		host: link.host,
		displayUrl: link.displayUrl,
		title: link.title,
		description: link.description,
		imageUrl: link.imageUrl,
		siteName: link.siteName,
		ogpFetchedAt: link.ogpFetchedAt?.toISOString() ?? null,
		ogpNextRefreshAt: link.ogpNextRefreshAt?.toISOString() ?? null,
	};
};

const fetchOpenGraphPreview = async (targetUrl: string) => {
	const parsedTargetUrl = assertSupportedHttpUrl(targetUrl);

	if (isYouTubeHostname(parsedTargetUrl.hostname)) {
		const youtubePreview = await fetchYouTubeOEmbedPreview(
			parsedTargetUrl,
		).catch(() => null);
		if (youtubePreview) {
			return youtubePreview;
		}
	}

	return fetchHtmlMetadataPreview(parsedTargetUrl);
};

const fetchYouTubeOEmbedPreview = async (targetUrl: URL) => {
	const endpoint = new URL("https://www.youtube.com/oembed");
	endpoint.searchParams.set("url", targetUrl.toString());
	endpoint.searchParams.set("format", "json");

	const response = await fetch(endpoint.toString(), {
		redirect: "follow",
		signal: AbortSignal.timeout(OGP_TIMEOUT_MS),
		headers: {
			Accept: "application/json",
			"User-Agent": "NumatterBot/1.0 (+https://numatter.app)",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch YouTube oEmbed: ${response.status}`);
	}

	const contentType = (
		response.headers.get("content-type") ?? ""
	).toLowerCase();
	if (!contentType.includes("application/json")) {
		throw new Error("YouTube oEmbed source is not JSON");
	}

	const payload = (await response.json()) as YouTubeOEmbedResponse;
	const title = normalizeMetaValue(payload.title ?? null);
	const imageUrl = toAbsoluteHttpUrl(
		payload.thumbnail_url ?? null,
		targetUrl.toString(),
	);
	const siteName = normalizeMetaValue(payload.provider_name ?? "YouTube");

	if (!title && !imageUrl) {
		throw new Error("YouTube oEmbed payload is empty");
	}

	return {
		title,
		description: null,
		imageUrl,
		siteName,
	};
};

const fetchHtmlMetadataPreview = async (parsedTargetUrl: URL) => {
	const response = await fetch(parsedTargetUrl.toString(), {
		redirect: "follow",
		signal: AbortSignal.timeout(OGP_TIMEOUT_MS),
		headers: {
			Accept: "text/html,application/xhtml+xml",
			"User-Agent": "NumatterBot/1.0 (+https://numatter.app)",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch OGP source: ${response.status}`);
	}

	const contentType = (
		response.headers.get("content-type") ?? ""
	).toLowerCase();
	if (!contentType.includes("text/html")) {
		throw new Error("OGP source is not HTML");
	}

	const html = extractMetadataSourceHtml(await response.text());
	const title =
		extractMetaContent(html, ["og:title", "twitter:title"]) ??
		extractTitleTag(html);
	const description =
		extractMetaContent(html, ["og:description", "twitter:description"]) ?? null;
	const siteName =
		extractMetaContent(html, ["og:site_name"]) ?? parsedTargetUrl.host;
	const image = extractMetaContent(html, [
		"og:image:secure_url",
		"og:image",
		"og:image:url",
		"twitter:image",
		"twitter:image:src",
	]);

	return {
		title: normalizeMetaValue(title),
		description: normalizeMetaValue(description),
		imageUrl: toAbsoluteHttpUrl(image, parsedTargetUrl.toString()),
		siteName: normalizeMetaValue(siteName),
	};
};

const isYouTubeHostname = (hostname: string) => {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "youtube.com" ||
		normalized.endsWith(".youtube.com") ||
		normalized === "youtu.be" ||
		normalized.endsWith(".youtu.be")
	);
};

const extractMetadataSourceHtml = (html: string) => {
	const limitedHtml = html.slice(0, OGP_HTML_MAX_LENGTH);
	const headCloseMatch = /<\/head\s*>/iu.exec(limitedHtml);
	if (!headCloseMatch || headCloseMatch.index === undefined) {
		return limitedHtml;
	}

	return limitedHtml.slice(0, headCloseMatch.index + headCloseMatch[0].length);
};

const extractMetaContent = (html: string, keys: string[]) => {
	const keySet = new Set(keys.map((key) => key.toLowerCase()));
	for (const metaTag of html.matchAll(/<meta\s+[^>]*>/giu)) {
		const tag = metaTag[0];
		if (!tag) {
			continue;
		}

		const attributes = parseTagAttributes(tag);
		const key = (
			attributes.get("property") ??
			attributes.get("name") ??
			""
		).toLowerCase();
		if (!keySet.has(key)) {
			continue;
		}

		const content = attributes.get("content");
		if (!content) {
			continue;
		}

		return content;
	}

	return null;
};

const extractTitleTag = (html: string) => {
	const matched = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
	if (!matched?.[1]) {
		return null;
	}

	return matched[1];
};

const parseTagAttributes = (tag: string) => {
	const attrs = new Map<string, string>();
	for (const match of tag.matchAll(
		/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gu,
	)) {
		const key = match[1]?.toLowerCase();
		const value = match[2] ?? match[3] ?? match[4] ?? "";
		if (!key) {
			continue;
		}

		attrs.set(key, value);
	}

	return attrs;
};

const normalizeMetaValue = (value: string | null) => {
	if (!value) {
		return null;
	}

	const normalized = value.replace(/\s+/gu, " ").trim();
	return normalized || null;
};

const toAbsoluteHttpUrl = (value: string | null, baseUrl: string) => {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value, baseUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}

		return url.toString();
	} catch {
		return null;
	}
};

const assertSupportedHttpUrl = (value: string) => {
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Unsupported URL protocol");
	}

	if (isBlockedHostname(url.hostname)) {
		throw new Error("Unsupported URL host");
	}

	return url;
};

const isBlockedHostname = (hostname: string) => {
	const normalized = hostname.toLowerCase();
	if (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal")
	) {
		return true;
	}

	if (normalized === "::1") {
		return true;
	}

	if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
		return true;
	}

	if (normalized.startsWith("fe80:")) {
		return true;
	}

	const ipv4Match = normalized.match(
		/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u,
	);
	if (!ipv4Match) {
		return false;
	}

	const octets = ipv4Match
		.slice(1)
		.map((segment) => Number.parseInt(segment, 10));
	if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
		return true;
	}

	const [first, second] = octets;
	if (
		first === 10 ||
		first === 127 ||
		first === 0 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	) {
		return true;
	}

	return false;
};

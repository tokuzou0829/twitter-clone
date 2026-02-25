import { MAX_HANDLE_LENGTH, parseUserHandle } from "@/lib/user-handle";

export const MAX_POST_CONTENT_LENGTH = 280;

const URL_REGEX = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_URL_PUNCTUATION_REGEX = /[),.!?:;\]]+$/u;
const HANDLE_BOUNDARY_REGEX = /[a-z0-9_]/iu;
const RAW_MENTION_REGEX = new RegExp(
	`@([a-z0-9_]{1,${MAX_HANDLE_LENGTH}})`,
	"giu",
);

export type PostLink = {
	url: string;
	normalizedUrl: string;
	displayUrl: string;
	host: string;
	start: number;
	end: number;
	position: number;
};

type PostMentionDraft = {
	handle: string;
	start: number;
	end: number;
	position: number;
};

export const extractPostLinks = (content: string): PostLink[] => {
	if (!content) {
		return [];
	}

	const links: PostLink[] = [];
	let position = 0;

	for (const match of content.matchAll(URL_REGEX)) {
		const matchedValue = match[0];
		const start = match.index;
		if (!matchedValue || start === undefined) {
			continue;
		}

		const trimmed = trimTrailingPunctuation(matchedValue);
		if (!trimmed) {
			continue;
		}

		const normalized = normalizeHttpUrl(trimmed);
		if (!normalized) {
			continue;
		}

		const url = new URL(normalized);
		links.push({
			url: trimmed,
			normalizedUrl: normalized,
			displayUrl: createDisplayUrl(url),
			host: url.host,
			start,
			end: start + trimmed.length,
			position,
		});
		position += 1;
	}

	return links;
};

export const extractUniquePostLinks = (content: string): PostLink[] => {
	const links = extractPostLinks(content);
	const unique = new Map<string, PostLink>();

	for (const link of links) {
		if (!unique.has(link.normalizedUrl)) {
			unique.set(link.normalizedUrl, link);
		}
	}

	return [...unique.values()].map((link, index) => ({
		...link,
		position: index,
	}));
};

export const extractPostMentions = (content: string): PostMentionDraft[] => {
	if (!content) {
		return [];
	}

	const links = extractPostLinks(content);
	const mentions: PostMentionDraft[] = [];

	for (const match of content.matchAll(RAW_MENTION_REGEX)) {
		const matchedValue = match[0];
		const rawHandle = match[1];
		const start = match.index;
		if (!matchedValue || !rawHandle || start === undefined) {
			continue;
		}

		const end = start + matchedValue.length;
		if (!hasMentionBoundary(content, start, end)) {
			continue;
		}

		if (isRangeOverlappingWithLinks(start, end, links)) {
			continue;
		}

		const normalizedHandle = parseUserHandle(rawHandle);
		if (!normalizedHandle) {
			continue;
		}

		mentions.push({
			handle: normalizedHandle,
			start,
			end,
			position: mentions.length,
		});
	}

	return mentions;
};

export const countPostContentLength = (content: string) => {
	if (!content) {
		return 0;
	}

	const links = extractPostLinks(content);
	if (links.length === 0) {
		return content.length;
	}

	const excludedLength = links.reduce(
		(sum, link) => sum + (link.end - link.start),
		0,
	);
	return content.length - excludedLength;
};

const trimTrailingPunctuation = (value: string) => {
	let current = value;

	while (TRAILING_URL_PUNCTUATION_REGEX.test(current)) {
		current = current.replace(TRAILING_URL_PUNCTUATION_REGEX, "");
	}

	return current;
};

const normalizeHttpUrl = (value: string) => {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return null;
	}

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

const hasMentionBoundary = (content: string, start: number, end: number) => {
	const previous = start > 0 ? content[start - 1] : "";
	const next = end < content.length ? content[end] : "";

	if (previous && HANDLE_BOUNDARY_REGEX.test(previous)) {
		return false;
	}

	if (next && HANDLE_BOUNDARY_REGEX.test(next)) {
		return false;
	}

	return true;
};

const isRangeOverlappingWithLinks = (
	start: number,
	end: number,
	links: PostLink[],
) => {
	return links.some((link) => start < link.end && end > link.start);
};

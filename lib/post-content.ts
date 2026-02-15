export const MAX_POST_CONTENT_LENGTH = 280;

const URL_REGEX = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_URL_PUNCTUATION_REGEX = /[),.!?:;\]]+$/u;

export type PostLink = {
	url: string;
	normalizedUrl: string;
	displayUrl: string;
	host: string;
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

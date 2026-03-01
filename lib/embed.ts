export const EMBED_THEMES = ["light", "dim", "dark"] as const;

export const EMBED_CARDS = ["visible", "hidden"] as const;

export const EMBED_CONVERSATIONS = ["all", "none"] as const;

export const EMBED_ALIGNS = ["left", "center", "right"] as const;

const EMBED_CHROME_OPTIONS = [
	"noheader",
	"nofooter",
	"noborders",
	"transparent",
	"noscrollbar",
] as const;

export type EmbedTheme = (typeof EMBED_THEMES)[number];

export type EmbedCards = (typeof EMBED_CARDS)[number];

export type EmbedConversation = (typeof EMBED_CONVERSATIONS)[number];

export type EmbedAlign = (typeof EMBED_ALIGNS)[number];

type EmbedChromeOption = (typeof EMBED_CHROME_OPTIONS)[number];

export type EmbedChromeOptions = Record<EmbedChromeOption, boolean>;

export type EmbedStyleOptions = {
	theme: EmbedTheme;
	cards: EmbedCards;
	conversation: EmbedConversation;
	chrome: EmbedChromeOptions;
	width: number;
	align: EmbedAlign;
	postLimit: number;
	dnt: boolean;
	compact: boolean;
	border: boolean;
	showMedia: boolean;
	showStats: boolean;
	radius: number;
	limit: number;
};

type EmbedSearchParamsInput =
	| URLSearchParams
	| {
			get: (key: string) => string | null;
	  }
	| Record<string, string | string[] | undefined>;

const EMBED_MIN_RADIUS = 0;
const EMBED_MAX_RADIUS = 32;
const EMBED_MIN_LIMIT = 1;
const EMBED_MAX_LIMIT = 20;
const EMBED_MIN_WIDTH = 220;
const EMBED_MAX_WIDTH = 550;

const EMBED_DEFAULT_CHROME_OPTIONS: EmbedChromeOptions = {
	noheader: false,
	nofooter: false,
	noborders: false,
	transparent: false,
	noscrollbar: false,
};

export const EMBED_DEFAULT_STYLE_OPTIONS: EmbedStyleOptions = {
	theme: "light",
	cards: "visible",
	conversation: "all",
	chrome: {
		...EMBED_DEFAULT_CHROME_OPTIONS,
	},
	width: 550,
	align: "center",
	postLimit: 5,
	dnt: false,
	compact: false,
	border: true,
	showMedia: true,
	showStats: true,
	radius: 16,
	limit: 5,
};

export const parseEmbedStyleOptions = (
	searchParams: EmbedSearchParamsInput,
): EmbedStyleOptions => {
	const themeValue = getSearchParamValue(searchParams, "theme");
	const theme = isEmbedTheme(themeValue)
		? themeValue
		: EMBED_DEFAULT_STYLE_OPTIONS.theme;
	const cardsValue = getSearchParamValue(searchParams, "cards");
	const parsedCards = isEmbedCards(cardsValue)
		? cardsValue
		: EMBED_DEFAULT_STYLE_OPTIONS.cards;
	const conversationValue = getSearchParamValue(searchParams, "conversation");
	const conversation = isEmbedConversation(conversationValue)
		? conversationValue
		: EMBED_DEFAULT_STYLE_OPTIONS.conversation;
	const alignValue = getSearchParamValue(searchParams, "align");
	const align = isEmbedAlign(alignValue)
		? alignValue
		: EMBED_DEFAULT_STYLE_OPTIONS.align;
	const legacyShowMedia = parseBooleanParam(
		getSearchParamValue(searchParams, "media") ??
			getSearchParamValue(searchParams, "showMedia"),
		EMBED_DEFAULT_STYLE_OPTIONS.showMedia,
	);
	const cards =
		cardsValue === null
			? legacyShowMedia
				? "visible"
				: "hidden"
			: parsedCards;
	const legacyBorder = parseBooleanParam(
		getSearchParamValue(searchParams, "border"),
		EMBED_DEFAULT_STYLE_OPTIONS.border,
	);
	const chrome = parseEmbedChromeOptions(
		getSearchParamValue(searchParams, "chrome"),
	);

	if (
		!legacyBorder ||
		parseBooleanParam(getSearchParamValue(searchParams, "noborders"), false)
	) {
		chrome.noborders = true;
	}

	if (parseBooleanParam(getSearchParamValue(searchParams, "noheader"), false)) {
		chrome.noheader = true;
	}

	if (parseBooleanParam(getSearchParamValue(searchParams, "nofooter"), false)) {
		chrome.nofooter = true;
	}

	if (
		parseBooleanParam(getSearchParamValue(searchParams, "transparent"), false)
	) {
		chrome.transparent = true;
	}

	if (
		parseBooleanParam(getSearchParamValue(searchParams, "noscrollbar"), false)
	) {
		chrome.noscrollbar = true;
	}

	const postLimit = parseNumberParam(
		getSearchParamValue(searchParams, "postLimit") ??
			getSearchParamValue(searchParams, "limit"),
		EMBED_DEFAULT_STYLE_OPTIONS.postLimit,
		EMBED_MIN_LIMIT,
		EMBED_MAX_LIMIT,
	);
	const showMedia = cards === "visible" && legacyShowMedia;
	const border = legacyBorder && !chrome.noborders;

	return {
		theme,
		cards,
		conversation,
		chrome,
		width: parseNumberParam(
			getSearchParamValue(searchParams, "width"),
			EMBED_DEFAULT_STYLE_OPTIONS.width,
			EMBED_MIN_WIDTH,
			EMBED_MAX_WIDTH,
		),
		align,
		postLimit,
		dnt: parseBooleanParam(
			getSearchParamValue(searchParams, "dnt"),
			EMBED_DEFAULT_STYLE_OPTIONS.dnt,
		),
		compact: parseBooleanParam(
			getSearchParamValue(searchParams, "compact"),
			EMBED_DEFAULT_STYLE_OPTIONS.compact,
		),
		border,
		showMedia,
		showStats: parseBooleanParam(
			getSearchParamValue(searchParams, "stats") ??
				getSearchParamValue(searchParams, "showStats"),
			EMBED_DEFAULT_STYLE_OPTIONS.showStats,
		),
		radius: parseNumberParam(
			getSearchParamValue(searchParams, "radius"),
			EMBED_DEFAULT_STYLE_OPTIONS.radius,
			EMBED_MIN_RADIUS,
			EMBED_MAX_RADIUS,
		),
		limit: postLimit,
	};
};

export const toEmbedStyleSearchParams = (
	styleOptions: EmbedStyleOptions,
): URLSearchParams => {
	const searchParams = new URLSearchParams();

	if (styleOptions.theme !== EMBED_DEFAULT_STYLE_OPTIONS.theme) {
		searchParams.set("theme", styleOptions.theme);
	}

	if (styleOptions.cards !== EMBED_DEFAULT_STYLE_OPTIONS.cards) {
		searchParams.set("cards", styleOptions.cards);
	}

	if (styleOptions.conversation !== EMBED_DEFAULT_STYLE_OPTIONS.conversation) {
		searchParams.set("conversation", styleOptions.conversation);
	}

	const chrome = toEmbedChromeSearchValue(styleOptions.chrome);
	if (chrome) {
		searchParams.set("chrome", chrome);
	}

	if (styleOptions.width !== EMBED_DEFAULT_STYLE_OPTIONS.width) {
		searchParams.set("width", String(styleOptions.width));
	}

	if (styleOptions.align !== EMBED_DEFAULT_STYLE_OPTIONS.align) {
		searchParams.set("align", styleOptions.align);
	}

	if (styleOptions.postLimit !== EMBED_DEFAULT_STYLE_OPTIONS.postLimit) {
		searchParams.set("postLimit", String(styleOptions.postLimit));
	}

	if (styleOptions.dnt !== EMBED_DEFAULT_STYLE_OPTIONS.dnt) {
		searchParams.set("dnt", styleOptions.dnt ? "1" : "0");
	}

	if (styleOptions.compact !== EMBED_DEFAULT_STYLE_OPTIONS.compact) {
		searchParams.set("compact", styleOptions.compact ? "1" : "0");
	}

	if (
		styleOptions.cards === "visible" &&
		styleOptions.showMedia !== EMBED_DEFAULT_STYLE_OPTIONS.showMedia
	) {
		searchParams.set("media", styleOptions.showMedia ? "1" : "0");
	}

	if (styleOptions.showStats !== EMBED_DEFAULT_STYLE_OPTIONS.showStats) {
		searchParams.set("stats", styleOptions.showStats ? "1" : "0");
	}

	if (styleOptions.radius !== EMBED_DEFAULT_STYLE_OPTIONS.radius) {
		searchParams.set("radius", String(styleOptions.radius));
	}

	return searchParams;
};

export const createEmbedThemeVariables = (
	theme: EmbedTheme,
): Record<string, string> => {
	if (theme === "dim") {
		return {
			"--embed-bg": "#15202b",
			"--embed-surface": "#1d2d3a",
			"--embed-surface-muted": "#223445",
			"--embed-border": "#38444d",
			"--embed-text-main": "#e6ecf0",
			"--embed-text-subtle": "#8899a6",
			"--embed-link": "#1d9bf0",
			"--embed-action-reply": "#1d9bf0",
			"--embed-action-quote": "#00ba7c",
			"--embed-action-like": "#f91880",
		};
	}

	if (theme === "dark") {
		return {
			"--embed-bg": "#000000",
			"--embed-surface": "#000000",
			"--embed-surface-muted": "#16181c",
			"--embed-border": "#2f3336",
			"--embed-text-main": "#e7e9ea",
			"--embed-text-subtle": "#71767b",
			"--embed-link": "#1d9bf0",
			"--embed-action-reply": "#1d9bf0",
			"--embed-action-quote": "#00ba7c",
			"--embed-action-like": "#f91880",
		};
	}

	return {
		"--embed-bg": "#ffffff",
		"--embed-surface": "#ffffff",
		"--embed-surface-muted": "#f7f9f9",
		"--embed-border": "#cfd9de",
		"--embed-text-main": "#0f1419",
		"--embed-text-subtle": "#536471",
		"--embed-link": "#1d9bf0",
		"--embed-action-reply": "#1d9bf0",
		"--embed-action-quote": "#00ba7c",
		"--embed-action-like": "#f91880",
	};
};

export const isEmbedBorderEnabled = (styleOptions: EmbedStyleOptions) => {
	return styleOptions.border && !styleOptions.chrome.noborders;
};

export const isEmbedFooterVisible = (styleOptions: EmbedStyleOptions) => {
	return !styleOptions.chrome.nofooter;
};

export const shouldShowEmbedMedia = (styleOptions: EmbedStyleOptions) => {
	return styleOptions.cards === "visible" && styleOptions.showMedia;
};

const getSearchParamValue = (
	searchParams: EmbedSearchParamsInput,
	key: string,
) => {
	if (hasGetMethod(searchParams)) {
		return searchParams.get(key);
	}

	const value = searchParams[key];
	if (Array.isArray(value)) {
		return value[0] ?? null;
	}

	return value ?? null;
};

const hasGetMethod = (
	searchParams: EmbedSearchParamsInput,
): searchParams is {
	get: (key: string) => string | null;
} => {
	return typeof (searchParams as { get?: unknown }).get === "function";
};

const parseBooleanParam = (value: string | null, fallback: boolean) => {
	if (value === null) {
		return fallback;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes") {
		return true;
	}

	if (normalized === "0" || normalized === "false" || normalized === "no") {
		return false;
	}

	return fallback;
};

const parseNumberParam = (
	value: string | null,
	fallback: number,
	min: number,
	max: number,
) => {
	if (value === null) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	return Math.max(min, Math.min(max, parsed));
};

const isEmbedTheme = (value: string | null): value is EmbedTheme => {
	return value !== null && EMBED_THEMES.some((theme) => theme === value);
};

const isEmbedCards = (value: string | null): value is EmbedCards => {
	return value !== null && EMBED_CARDS.some((cards) => cards === value);
};

const isEmbedConversation = (
	value: string | null,
): value is EmbedConversation => {
	return (
		value !== null &&
		EMBED_CONVERSATIONS.some((conversation) => conversation === value)
	);
};

const isEmbedAlign = (value: string | null): value is EmbedAlign => {
	return value !== null && EMBED_ALIGNS.some((align) => align === value);
};

const parseEmbedChromeOptions = (value: string | null): EmbedChromeOptions => {
	const nextChromeOptions: EmbedChromeOptions = {
		...EMBED_DEFAULT_CHROME_OPTIONS,
	};

	if (!value) {
		return nextChromeOptions;
	}

	const tokens = value
		.toLowerCase()
		.split(/[\s,]+/u)
		.map((token) => token.trim())
		.filter((token) => token.length > 0);

	for (const token of tokens) {
		if (!isEmbedChromeOption(token)) {
			continue;
		}

		nextChromeOptions[token] = true;
	}

	return nextChromeOptions;
};

const toEmbedChromeSearchValue = (chrome: EmbedChromeOptions) => {
	return EMBED_CHROME_OPTIONS.filter((option) => chrome[option]).join(" ");
};

const isEmbedChromeOption = (value: string): value is EmbedChromeOption => {
	return EMBED_CHROME_OPTIONS.some((option) => option === value);
};

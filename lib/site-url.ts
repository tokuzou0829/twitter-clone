const FALLBACK_SITE_ORIGIN = "http://localhost:3000";

const getSiteOrigin = (): string => {
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

export const toAbsoluteSiteUrl = (pathname: string): string => {
	return new URL(pathname, getSiteOrigin()).toString();
};

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Numatter",
		short_name: "Numatter",
		description: "ぬまったーはシンプルなスーパーSNSです。",
		start_url: "/",
		display: "standalone",
		background_color: "#f7f9f9",
		theme_color: "#1d9bf0",
		icons: [
			{
				sizes: "192x192",
				src: "icon192_rounded.png",
				type: "image/png",
			},
			{
				sizes: "512x512",
				src: "icon512_rounded.png",
				type: "image/png",
			},
		],
	};
}

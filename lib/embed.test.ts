import { describe, expect, it } from "vitest";

import {
	EMBED_DEFAULT_STYLE_OPTIONS,
	parseEmbedStyleOptions,
	toEmbedStyleSearchParams,
} from "./embed";

describe("lib/embed", () => {
	it("空のパラメータではデフォルト値を返す", () => {
		const parsed = parseEmbedStyleOptions({});

		expect(parsed).toEqual(EMBED_DEFAULT_STYLE_OPTIONS);
	});

	it("有効な値をパースし、範囲外の数値はクランプする", () => {
		const parsed = parseEmbedStyleOptions(
			new URLSearchParams({
				theme: "dark",
				cards: "hidden",
				conversation: "none",
				chrome: "noheader nofooter transparent",
				align: "right",
				width: "999",
				postLimit: "-1",
				dnt: "true",
				compact: "1",
				border: "0",
				media: "true",
				stats: "true",
				radius: "999",
			}),
		);

		expect(parsed).toEqual({
			theme: "dark",
			cards: "hidden",
			conversation: "none",
			chrome: {
				noheader: true,
				nofooter: true,
				noborders: true,
				transparent: true,
				noscrollbar: false,
			},
			width: 550,
			align: "right",
			postLimit: 1,
			dnt: true,
			compact: true,
			border: false,
			showMedia: false,
			showStats: true,
			radius: 32,
			limit: 1,
		});
	});

	it("旧パラメータのみでも新しいオプションへ反映される", () => {
		const parsed = parseEmbedStyleOptions({
			media: "0",
			limit: "9",
		});

		expect(parsed.cards).toBe("hidden");
		expect(parsed.showMedia).toBe(false);
		expect(parsed.postLimit).toBe(9);
		expect(parsed.limit).toBe(9);
	});

	it("不正な値はフォールバックする", () => {
		const parsed = parseEmbedStyleOptions({
			theme: "unknown",
			compact: "maybe",
			border: "n/a",
			radius: "x",
			limit: "NaN",
		});

		expect(parsed).toEqual(EMBED_DEFAULT_STYLE_OPTIONS);
	});

	it("デフォルトとの差分だけクエリへシリアライズする", () => {
		const query = toEmbedStyleSearchParams({
			...EMBED_DEFAULT_STYLE_OPTIONS,
			theme: "dim",
			cards: "hidden",
			conversation: "none",
			chrome: {
				...EMBED_DEFAULT_STYLE_OPTIONS.chrome,
				noheader: true,
				nofooter: true,
				noborders: true,
			},
			width: 320,
			align: "left",
			postLimit: 10,
			dnt: true,
		});

		expect(query.toString()).toBe(
			"theme=dim&cards=hidden&conversation=none&chrome=noheader+nofooter+noborders&width=320&align=left&postLimit=10&dnt=1",
		);
	});

	it("互換オプションは有効時のみクエリへ含める", () => {
		const query = toEmbedStyleSearchParams({
			...EMBED_DEFAULT_STYLE_OPTIONS,
			showMedia: false,
			showStats: false,
			compact: true,
			radius: 20,
		});

		expect(query.get("media")).toBe("0");
		expect(query.get("stats")).toBe("0");
		expect(query.get("compact")).toBe("1");
		expect(query.get("radius")).toBe("20");
	});
});

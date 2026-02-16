import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Noto_Sans_JP } from "next/font/google";

import { PageTransition } from "@/components/page-transition";
import "./globals.css";

const bodySans = Noto_Sans_JP({
	variable: "--font-ui-sans",
	subsets: ["latin"],
	weight: ["400", "500", "700", "800"],
});

const bodyMono = JetBrains_Mono({
	variable: "--font-ui-mono",
	subsets: ["latin"],
	weight: ["400", "600"],
});

export const metadata: Metadata = {
	title: "Numatter",
	description: "ぬまったーはシンプルなスーパーSNSです。",
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ja">
			<body
				className={`${bodySans.variable} ${bodyMono.variable} min-h-screen bg-[var(--app-bg)] text-[var(--text-main)] antialiased`}
			>
				<main className="min-h-screen">
					<PageTransition>{children}</PageTransition>
				</main>
			</body>
		</html>
	);
}

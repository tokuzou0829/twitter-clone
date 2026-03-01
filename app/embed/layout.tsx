import type { ReactNode } from "react";

type EmbedLayoutProps = {
	children: ReactNode;
};

export default function EmbedLayout({ children }: EmbedLayoutProps) {
	return <div data-embed-route>{children}</div>;
}

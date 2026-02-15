import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { config } from "./env";

config();

export default defineConfig(async () => {
	return {
		plugins: [react(), tsconfigPaths()],
		test: {
			globals: true,
			mockReset: true,
			restoreMocks: true,
			clearMocks: true,
			include: ["./**/*.test.{ts,tsx}"],
			globalSetup: "./tests/vitest.setup.ts",
			environment: "jsdom",
		},
	};
});

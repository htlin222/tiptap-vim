import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		include: ["packages/**/__tests__/**/*.ts"],
		setupFiles: "./vitest.setup.ts",
	},
});

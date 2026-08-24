import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the tsconfig "@/*" path alias so imports resolve in tests.
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
  },
});

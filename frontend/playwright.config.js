import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.spec.mjs",
  workers: 1,
  use: {
    viewport: { width: 393, height: 852 },
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
      executablePath: process.env.CHROMIUM_PATH || undefined,
    },
  },
});

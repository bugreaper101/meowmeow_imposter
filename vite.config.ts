import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const repoName = "meowmeow_imposter";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : "/",
  tanstackStart: {
    server: {
      entry: "src/server",
    },
  },
});
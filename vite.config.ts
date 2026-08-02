import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const repoName = "meowmeow_imposter";
const base = process.env["GITHUB_ACTIONS"] ? `/${repoName}/` : "/";

export default defineConfig({
  base,
  tanstackStart: {
    server: {
      entry: "src/server",
    },
  },
} as any);
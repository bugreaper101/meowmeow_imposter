import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const repoName = "meowmeow_imposter";
const isGitHubPages = Boolean(process.env["GITHUB_ACTIONS"]);
const base = isGitHubPages ? `/${repoName}/` : "/";

export default defineConfig({
  vite: {
    base,
    server: {
      watch: {
        ignored: ["**/docs/**", "**/assets/**"],
      },
    },
  },
  tanstackStart: {
    client: {
      entry: "./client.tsx",
    },
    router: isGitHubPages ? { basepath: `/${repoName}` } : undefined,
    server: {
      entry: "src/server",
    },
  },
} as any);
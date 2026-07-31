import { createFileRoute } from "@tanstack/react-router";
import MeowMeowImposter from "@/components/MeowMeowImposter";

export const Route = createFileRoute("/meowmeow")({
  head: () => ({
    meta: [
      { title: "MeowMeow Imposter — Cozy Kitty Social Deduction UI" },
      { name: "description", content: "A pastel mobile UI kit for MeowMeow Imposter: splash, lobby, avatars, roles, clues, voting, scoreboard and winner screens." },
      { property: "og:title", content: "MeowMeow Imposter — Cozy Kitty Social Deduction UI" },
      { property: "og:description", content: "17 premium pastel mobile screens for MeowMeow Imposter, including dialogs, toasts and empty states." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MeowMeowImposter,
});

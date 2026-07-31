import { createFileRoute } from "@tanstack/react-router";
import MeowMeowImposter from "@/components/MeowMeowImposter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MeowMeow Imposter" },
      {
        name: "description",
        content:
          "A pastel mobile UI kit for MeowMeow Imposter: splash, lobby, 70 avatars, roles, clues, voting, scoreboard and winner screens.",
      },
      { property: "og:title", content: "MeowMeow Imposter" },
      {
        property: "og:description",
        content:
          "A pastel mobile UI kit for MeowMeow Imposter: splash, lobby, 70 avatars, roles, clues, voting, scoreboard and winner screens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MeowMeowImposter,
});

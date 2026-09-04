import { StrictMode, startTransition } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

const app = (
  <StrictMode>
    <StartClient />
  </StrictMode>
);

startTransition(() => {
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(app);
    return;
  }
  hydrateRoot(document, app);
});

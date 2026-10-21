import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/site/HomePage";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "i-Save — Save for what matters to you" },
      {
        name: "description",
        content:
          "From education to life’s unexpected moments, start with a goal and explore your next steps with i-Save.",
      },
    ],
  }),
  component: HomePage,
});

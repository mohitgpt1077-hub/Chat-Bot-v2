import { createFileRoute } from "@tanstack/react-router";
import UpesChat from "@/components/UpesChat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UPES Assistant — Chat About Programs & Admissions" },
      {
        name: "description",
        content:
          "Chat with the UPES Assistant to explore programs, specializations, eligibility, fees, scholarships, placements and how to apply.",
      },
      { property: "og:title", content: "UPES Assistant — Programs & Admissions Chat" },
      {
        property: "og:description",
        content:
          "Guided chat for students and parents: programs, eligibility, fees, scholarships and admissions at UPES.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <h1 className="sr-only">UPES Assistant chat for students and parents</h1>
      <UpesChat />
    </main>
  );
}

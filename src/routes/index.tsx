import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/pme-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "POME — Attendance & Timesheets" },
      { name: "description", content: "Pioneers of the Middle East staff portal." },
      { property: "og:title", content: "POME — Attendance & Timesheets" },
      { property: "og:description", content: "Pioneers of the Middle East staff portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center border-t-4 border-primary bg-background px-6 py-12">
      <main className="w-full max-w-sm text-center">
        <img src={logoAsset.url} alt="POME — Pioneers of the Middle East" className="mx-auto mb-10 h-auto w-64 max-w-full" />
        <h1 className="text-2xl">POME</h1>
        <p className="mt-2 text-sm text-muted-foreground">Attendance & Timesheets</p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link to="/auth">Sign in</Link>
        </Button>
      </main>
    </div>
  );
}

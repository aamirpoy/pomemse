import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Punchline — Location-verified attendance" },
      { name: "description", content: "Employees check in and out from the office. Managers get accurate timesheets." },
      { property: "og:title", content: "Punchline — Location-verified attendance" },
      { property: "og:description", content: "Employees check in and out from the office. Managers get accurate timesheets." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-hero text-primary-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <span className="font-display text-2xl">Punchline</span>
          <Button asChild variant="secondary" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>
        <main className="flex flex-1 flex-col justify-center py-16">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-accent">
            Attendance · Timesheets
          </p>
          <h1 className="max-w-3xl text-5xl leading-[1.05] md:text-7xl">
            Clock in where the work happens.
          </h1>
          <p className="mt-6 max-w-xl text-lg opacity-80">
            One tap to check in and out — only allowed when you're at the office.
            Hours add up automatically into clean timesheets.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/auth">Employee sign in</Link>
            </Button>
          </div>
          <div className="mt-20 grid gap-6 sm:grid-cols-3">
            {[
              { icon: MapPin, t: "Location check", d: "Check-in only works within the office radius." },
              { icon: Clock, t: "Automatic hours", d: "Daily and weekly totals, no spreadsheets." },
              { icon: ShieldCheck, t: "Manager view", d: "See who's in, export timesheets to CSV." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="border-t border-primary-foreground/20 pt-4">
                <Icon className="mb-3 h-5 w-5 text-accent" />
                <div className="font-semibold">{t}</div>
                <div className="text-sm opacity-70">{d}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

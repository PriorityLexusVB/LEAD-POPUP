import ErrorBoundary from "@/components/app/ErrorBoundary";
import LeadList from "@/components/app/LeadList";
import { Toaster } from "@/components/ui/toaster";
import { Mail } from "lucide-react";

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6 max-w-4xl">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Mail className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-semibold tracking-tighter md:text-2xl">
                Priority Lead Sync
              </h1>
            </div>
          </div>
        </header>
        <main className="container mx-auto max-w-4xl p-4">
          <LeadList />
        </main>
      </div>
      <Toaster />
    </ErrorBoundary>
  );
}

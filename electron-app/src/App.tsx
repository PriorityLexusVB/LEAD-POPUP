import ErrorBoundary from "@/components/app/ErrorBoundary";
import LeadList from "@/components/app/LeadList";
import { Toaster } from "@/components/ui/toaster";

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-xl font-semibold">Priority Leads</h1>
          <LeadList />
        </div>
      </div>
      <Toaster />
    </ErrorBoundary>
  );
}

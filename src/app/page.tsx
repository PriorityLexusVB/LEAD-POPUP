import LeadList from "@/components/app/LeadList";
import { Mail } from 'lucide-react';
import type { Lead } from "@/types/lead";

async function getLeads(): Promise<Lead[]> {
  try {
    // This fetch needs to be aligned with where the app is hosted.
    // For local dev, this assumes the app is running on localhost:3000.
    // In production, this URL needs to be the deployed App Hosting URL.
    // Using a relative URL is the most robust approach.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const response = await fetch(`${baseUrl}/api/leads`, { cache: 'no-store' });

    if (!response.ok) {
      console.error('Failed to fetch leads:', response.statusText);
      return [];
    }
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
}


export default async function Home() {
  const initialLeads = await getLeads();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6 max-w-4xl">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Mail className="h-5 w-5" />
            </div>
            <h1 className="font-headline text-xl font-semibold tracking-tighter md:text-2xl">
              Priority Lead Sync
            </h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-4xl p-4">
        <LeadList initialLeads={initialLeads} />
      </main>
    </div>
  );
}

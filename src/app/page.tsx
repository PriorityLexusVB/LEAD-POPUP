import { mockLeads } from '@/lib/mock-data';
import LeadList from '@/components/app/LeadList';
import { Mail, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Mail className="h-5 w-5" />
            </div>
            <h1 className="font-headline text-xl font-semibold tracking-tighter md:text-2xl">
              Priority Lead Sync
            </h1>
          </div>
          <Button asChild>
            <Link href="/add-lead">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add New Lead
            </Link>
          </Button>
        </div>
      </header>
      <main className="container mx-auto p-4 md:p-6">
        <LeadList initialLeads={mockLeads} />
      </main>
    </div>
  );
}

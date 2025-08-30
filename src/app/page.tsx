import LeadList from '@/components/app/LeadList';
import { Mail, Compass, Code, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
        </div>
      </header>
      <main className="container mx-auto p-4 md:p-6">
        
        {/* Helper Card - This can be removed later */}
        <Card className="mb-8 border-accent bg-accent/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-accent">
              <Compass className="h-5 w-5" />
              Finding Your Way in Firebase Studio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>It looks like you're having trouble finding the file explorer. Here’s a quick guide to the layout:</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Code className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">File Explorer (On the Left)</h3>
                  <p className="text-sm text-muted-foreground">
                    This is the panel on the **far left** of your screen. It shows a list of all your project's folders and files (like `src`, `package.json`, etc.). This is where you need to create the new `functions` folder.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Terminal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Editor & App Preview (Center)</h3>
                  <p className="text-sm text-muted-foreground">
                    This is the main area where you are right now. You can see your app's live preview and this chat with me.
                  </p>
                </div>
              </div>
            </div>
             <p className="pt-2 text-sm text-muted-foreground">If you still don't see the file explorer on the left, it might be collapsed. Look for an icon that looks like a file or folder on the very edge of your screen and click it to expand the panel.</p>
          </CardContent>
        </Card>

        <LeadList />
      </main>
    </div>
  );
}

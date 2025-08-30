
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { addLead } from '@/app/actions';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';

const formSchema = z.object({
  customerName: z.string().min(2, {
    message: 'Customer name must be at least 2 characters.',
  }),
  vehicle: z.string().min(2, {
    message: 'Vehicle must be at least 2 characters.',
  }),
  comments: z.string().min(10, {
    message: 'Comments must be at least 10 characters.',
  }),
});

export type AddLeadFormValues = z.infer<typeof formSchema>;

export default function AddLeadPage() {
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<AddLeadFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: '',
      vehicle: '',
      comments: '',
    },
  });

  async function onSubmit(values: AddLeadFormValues) {
    try {
      const result = await addLead(values);
      if (result.success) {
        toast({
          title: 'Lead Submitted!',
          description: 'The new lead has been successfully sent to your Google Sheet.',
        });
        router.push('/');
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 md:p-6">
      <header className="mb-8">
         <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Leads
            </Link>
        </Button>
        <h1 className="font-headline text-3xl font-bold">Add a New Lead</h1>
        <p className="text-muted-foreground">This form will send the lead information directly to your configured Google Sheet.</p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="vehicle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vehicle of Interest</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 2024 Honda Civic" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="comments"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Comments</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter any comments or questions from the customer..."
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
               {form.formState.isSubmitting ? 'Submitting...' : 'Submit Lead'}
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

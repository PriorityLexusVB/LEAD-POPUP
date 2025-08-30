
import { NextResponse } from 'next/server';
import { addLeadToSheet } from '@/app/actions';
import {Replicache} from 'replicache';
import { M, mutators } from '@/lib/replicache';

// This is a simplified in-memory store for leads for demonstration.
// For production, you would use a persistent database.
let leads: any[] = [];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerName, vehicle, comments } = body;

    if (!customerName || !vehicle || !comments) {
      return NextResponse.json({ success: false, message: 'Missing required fields.' }, { status: 400 });
    }

    const newLead = {
      id: `msg-${Date.now()}`,
      customerName,
      vehicle,
      comments,
      status: 'new',
      timestamp: Date.now(),
    };

    // Add to in-memory store
    leads.unshift(newLead);
    
    // For a real-time update, you would use a service like Firebase Realtime Database or Firestore
    // and a library like 'swr' or 'react-query' on the client to fetch and re-render.
    // For this demo, we'll just log it. The client will need to be refreshed to see new leads from the API.

    // Also send to Google Sheet
    await addLeadToSheet(newLead);
    
    // In a real app, you would have a Replicache server and push updates.
    // This is a placeholder for that logic.
    // const rep = new Replicache({
    //   mutators,
    //   name: 'server',
    // });
    // await rep.mutate.createLead(newLead);


    return NextResponse.json({ success: true, lead: newLead });
  } catch (error) {
    console.error('API - Error processing lead:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, message: `Failed to process lead. ${errorMessage}` }, { status: 500 });
  }
}

export async function GET() {
    // This allows the client to fetch the latest leads.
    return NextResponse.json({ leads });
}


import { NextResponse, type NextRequest } from 'next/server';
import { addLeadToSheet } from '@/app/actions';

// This is a simplified in-memory store for leads for demonstration.
// For production, you would use a persistent database.
let leads: any[] = [];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerName, vehicle, comments } = body;

    if (!customerName || !vehicle || !comments) {
      return NextResponse.json({ success: false, message: 'Missing required fields.' }, { status: 400, headers: CORS_HEADERS });
    }

    const newLead = {
      id: `msg-${Date.now()}`,
      customerName,
      vehicle,
      comments,
      status: 'new' as const,
      timestamp: Date.now(),
    };

    // Add to in-memory store
    leads.unshift(newLead);
    
    // Also send to Google Sheet
    await addLeadToSheet(newLead);

    return NextResponse.json({ success: true, lead: newLead }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('API - Error processing lead:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, message: `Failed to process lead. ${errorMessage}` }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function GET(request: Request) {
    // This allows the client to fetch the latest leads.
    return NextResponse.json({ leads }, { headers: CORS_HEADERS });
}

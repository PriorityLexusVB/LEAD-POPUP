import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Lead } from '@/types/lead';
import { Timestamp } from 'firebase-admin/firestore';

// Helper function to convert Firestore Timestamps to JSON-serializable format
const convertTimestamps = (obj: any): any => {
  if (obj instanceof Timestamp) {
    return obj.toDate().toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertTimestamps);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[key] = convertTimestamps(obj[key]);
      return acc;
    }, {} as { [key: string]: any });
  }
  return obj;
};


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    const snapshot = await adminDb
      .collection('leads_v2')
      .orderBy('createdAt', 'desc')
      .limit(Math.max(1, Math.min(limit, 200)))
      .get();
      
    const data: Lead[] = snapshot.docs.map(doc => {
      const docData = doc.data();
      const cleanedData = convertTimestamps(docData);
      return {
        id: doc.id,
        ...cleanedData
      } as Lead;
    });

    return NextResponse.json({ items: data });
  } catch (error) {
    console.error("Error fetching leads:", error);
    // In case of an error, return an empty list
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}

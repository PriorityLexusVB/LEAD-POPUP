import type { Lead } from '@/lib/types';

export const mockLeads: Lead[] = [
  {
    id: 'msg-12345',
    customerName: 'John Doe',
    vehicle: '2023 Ford F-150',
    comments: 'Interested in the Lariat trim with the black appearance package. Wants to know about financing options.',
    status: 'new',
    timestamp: Date.now() - 1000 * 60 * 5,
  },
  {
    id: 'msg-12346',
    customerName: 'Jane Smith',
    vehicle: '2024 Honda Civic',
    comments: 'Looking for a reliable commuter car. Is the LX model available in Aegean Blue?',
    status: 'new',
    timestamp: Date.now() - 1000 * 60 * 22,
  },
  {
    id: 'msg-12347',
    customerName: 'Alex Johnson',
    vehicle: '2023 Toyota RAV4 Hybrid',
    comments: 'Wants to schedule a test drive for this weekend. Prefers Saturday morning.',
    status: 'handled',
    suggestion: 'Hi Alex, we can definitely get you in for a test drive this Saturday. What time works best for you? We have openings at 9 AM and 11 AM.',
    timestamp: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'msg-12348',
    customerName: 'Emily White',
    vehicle: '2023 Hyundai Palisade',
    comments: 'My lease is up soon. I need a 3-row SUV for my growing family. What are the current lease deals on the Palisade Calligraphy?',
    status: 'new',
    timestamp: Date.now() - 1000 * 60 * 60 * 4,
  },
];

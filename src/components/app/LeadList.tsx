
'use client';

import { useState, useEffect } from 'react';
import { type Lead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

function isLead(doc: DocumentData): doc is Lead {
    const d = doc as any;
    // Check for new nested structure OR old flat structure
    return d && (d.customer || d.customerName) && (d.comments || d.vehicle);
}

// Helper to construct a display name for the vehicle
function formatVehicleName(vehicle: Lead['vehicle'], oldVehicleString?: string) {
    if (vehicle && (vehicle.make || vehicle.model || vehicle.year)) {
      return `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || "Vehicle not specified";
    }
    if(oldVehicleString) {
        return oldVehicleString;
    }
    return "Vehicle not specified";
}


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Corrected to listen to the 'email_leads' collection
    const q = query(collection(db, 'email_leads'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      const isFirstLoad = leads.length === 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data() as any; // Use any to handle both old and new structures
        const docId = doc.id;
        
        // ** THE FIX IS HERE: **
        // Adapt to both old (flat) and new (nested) data structures.
        const lead: Lead = {
            id: docId,
            customer: data.customer || { name: data.customerName || 'Unknown Lead', email: null, phone: null },
            vehicle: data.vehicle || { year: null, make: null, model: data.vehicle || null, vin: null },
            comments: data.comments || `Inquiry about`,
            status: data.status || 'new',
            suggestion: data.suggestion || '',
            timestamp: data.timestamp || (data.receivedAt?.seconds ? data.receivedAt.seconds * 1000 : Date.now()),
            receivedAt: data.receivedAt,
            source: data.source,
            format: data.format,
        };

        // The old format might just have a string for vehicle, let's pass it to formatVehicleName
        const vehicleDisplayName = formatVehicleName(lead.vehicle, typeof data.vehicle === 'string' ? data.vehicle : undefined);
         
        // Re-assign vehicle as an object for consistency in the app
        if (typeof data.vehicle === 'string') {
            lead.vehicle.model = data.vehicle;
        }


        if (isLead(lead)) {
            newLeads.push(lead);

            // Notify for new leads after the initial data load
            if (!isFirstLoad && lead.status === 'new' && !leads.find(l => l.id === lead.id)) {
                sendNotification({
                    title: `New Lead: ${lead.customer.name || 'Unknown'}`,
                    body: `Interested in: ${vehicleDisplayName}`,
                });
            }
        }
      });
      
      setLeads(newLeads);
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError(`Failed to connect to Firestore: ${err.message}`);
    });

    return () => unsubscribe();
    // The dependency array is intentionally empty to set up the listener only once.
  }, []);

  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        const permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          await requestPermission();
        }
      } catch (e) {
        console.error("Could not request notification permissions, probably not in Tauri.", e)
      }
    };
    requestNotificationPermission();
  }, []);

  const updateLead = async (updatedLead: Lead) => {
    try {
        const leadRef = doc(db, 'email_leads', updatedLead.id);
        await updateDoc(leadRef, {
            status: updatedLead.status,
            suggestion: updatedLead.suggestion || '',
        });
    } catch(e) {
        console.error("Failed to update lead: ", e);
    }
  };

  const newLeads = leads.filter(lead => lead.status === 'new');
  const handledLeads = leads.filter(lead => lead.status === 'handled');
  
  if (error) return <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed"><p className="text-destructive">{error}</p></div>

  return (
    <Tabs defaultValue="new" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="new">New Leads ({newLeads.length})</TabsTrigger>
        <TabsTrigger value="handled">Handled ({handledLeads.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="new">
        <div className="grid gap-6 pt-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {newLeads.length > 0 ? (
            newLeads.map(lead => <LeadCard key={lead.id} lead={lead} onUpdate={updateLead} />)
          ) : (
            <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground">No new leads. You're all caught up!</p>
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="handled">
        <div className="grid gap-6 pt-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {handledLeads.length > 0 ? (
             handledLeads.map(lead => <LeadCard key={lead.id} lead={lead} onUpdate={updateLead} />)
          ) : (
             <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground">No leads have been handled yet.</p>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

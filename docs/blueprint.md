# **App Name**: Priority Lead Sync

## Core Features:

- Real-time Gmail Ingestion: Automatically ingest new sales leads from Gmail using Pub/Sub notifications.
- Data Parsing and Normalization: Parse structured ADF/XML and unstructured plaintext lead data, then normalize for consistent storage and use.
- Firestore and Google Sheets Storage: Store parsed lead data in Firestore for real-time access and Google Sheets for BI/reporting.
- AI-Powered Reply Suggestions: Use Vertex AI and Google Cloud Workflows to generate suggested replies for new leads.
- Desktop Application with Real-time Notifications: Display new lead notifications in a system tray Electron app with a live connection to Firestore. Lets the LLM be a tool to enrich each potential customer communication.
- Lead Handling Workflow: Allow users to mark leads as 'handled' in the desktop app, updating its status in Firestore.
- Secure Communication: Employ contextBridge to communicate securely with the operating system.

## Style Guidelines:

- Primary color: Deep blue (#2962FF) for a professional and trustworthy feel.
- Background color: Light gray (#F5F5F5) for a clean and modern look.
- Accent color: Vibrant orange (#FF6B00) for CTAs and highlights.
- Body font: 'Inter', a grotesque-style sans-serif with a modern look; suitable for body text
- Headline font: 'Space Grotesk', a proportional sans-serif with a computerized feel, complementing Inter
- Use minimalist icons for lead status and actions.
- Keep the desktop app interface clean and focused on lead information and AI-generated suggestions.
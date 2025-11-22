# Priority Lead Sync

A modern lead management system for automotive dealerships that intelligently captures, processes, and surfaces high-priority sales leads.

## 📋 Documentation

- **[QUICK_START.md](./QUICK_START.md)** - Quick reference guide and immediate action items
- **[DIAGNOSTIC_REPORT.md](./DIAGNOSTIC_REPORT.md)** - Comprehensive analysis and recommendations
- **[docs/blueprint.md](./docs/blueprint.md)** - Original project blueprint

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Firebase account
- Google AI API key

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   cp functions/.env.example functions/.env
   # Edit .env files with your credentials
   ```

3. **Build and run:**
   ```bash
   npm run build    # Build the app
   npm run dev      # Start development server
   ```

4. **Deploy to Firebase:**
   ```bash
   firebase deploy
   ```

## 🏗️ Architecture

### Tech Stack
- **Frontend:** Next.js 14 (App Router), React, TypeScript
- **UI Library:** shadcn/ui with Radix UI primitives
- **Styling:** Tailwind CSS
- **Backend:** Firebase (Firestore + Cloud Functions)
- **AI:** Google Genkit with Gemini
- **Email Parsing:** mailparser, fast-xml-parser

### Core Features
- ✅ Gmail webhook ingestion
- ✅ ADF/XML and chat lead parsing
- ✅ AI-powered reply suggestions
- ✅ Real-time lead status management
- ✅ Professional dark mode UI
- ⚠️ Real-time sync (needs implementation)
- ⚠️ Google Sheets integration (needs implementation)

## 📖 For Detailed Information

See [DIAGNOSTIC_REPORT.md](./DIAGNOSTIC_REPORT.md) for:
- Complete feature analysis
- Security assessment
- Known issues and solutions
- Recommended improvements
- Phase-by-phase action plan

## 🤝 Contributing

This is a Next.js app hosted on Firebase. To contribute:

1. Create a feature branch
2. Make your changes
3. Test thoroughly (see DIAGNOSTIC_REPORT.md for build instructions)
4. Submit a pull request

## 📝 Environment Variables

Required variables (see `.env.example` for details):
- `NEXT_PUBLIC_BASE_URL` - App URL
- `FIREBASE_PROJECT_ID` - Firebase project
- `FIREBASE_CLIENT_EMAIL` - Service account email
- `FIREBASE_PRIVATE_KEY` - Service account key
- `GOOGLE_API_KEY` - For AI features

## 🐛 Known Issues

- Genkit dependencies cause build warnings (non-blocking)
- See DIAGNOSTIC_REPORT.md for complete list

## 📄 License

Private - Priority Lexus VB

---

**Status:** ✅ Buildable and deployable | ⚠️ 60% feature complete

For immediate actions, see [QUICK_START.md](./QUICK_START.md)

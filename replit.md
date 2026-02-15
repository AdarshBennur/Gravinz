# replit.md

## Overview

OutboundAI is a production-grade SaaS application for an AI-powered cold email automation platform targeting job seekers. It features a complete backend with PostgreSQL database, session-based authentication, comprehensive REST API, AI email generation (with intelligent fallback), and a React frontend. The app includes a public landing page, authentication flows (login, signup, forgot password), and a full dashboard with contacts, campaigns, analytics, integrations, settings, and profile pages.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The project lives inside the `SaaS-Frontend/` directory and follows a fullstack monorepo layout.

```
SaaS-Frontend/
├── client/           # React frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI components (shadcn/ui + custom app components)
│   │   ├── pages/        # Route pages
│   │   ├── hooks/        # Custom React hooks (use-auth, use-toast, etc.)
│   │   ├── lib/          # Utilities, query client, API helpers
│   │   └── index.css     # Global styles with Tailwind CSS
│   └── index.html        # Entry HTML
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # All API route handlers (30+ endpoints)
│   ├── auth.ts       # Authentication middleware (session-based)
│   ├── storage.ts    # Database storage layer (PostgreSQL via Drizzle)
│   └── db.ts         # Database connection setup
├── shared/           # Shared schema (Drizzle ORM + Zod)
│   └── schema.ts     # Full database schema (10+ tables)
├── migrations/       # Drizzle migration output
└── attached_assets/  # Design spec documents
```

### Frontend Architecture
- **Framework**: React with Vite as build tool
- **Routing**: `wouter` (lightweight client-side router)
- **State Management**: `@tanstack/react-query` for server state; local React state for UI
- **Auth**: `use-auth.tsx` hook with React Context for auth state management
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS v4 (using `@tailwindcss/vite` plugin), with CSS variables for theming
- **Theme Support**: `next-themes` for dark/light/system mode switching
- **Animations**: `framer-motion` for landing page animations
- **API Layer**: `lib/api.ts` provides `apiGet`, `apiPost`, `apiPut`, `apiDelete` helpers with credentials
- **Path Aliases**: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`

### Key Pages & Routes
- `/` — Landing page (public marketing page)
- `/login`, `/signup`, `/forgot-password` — Auth pages (real authentication)
- `/app/dashboard` — Main dashboard with stats cards and activity table
- `/app/contacts` — Contact management (CRUD operations)
- `/app/campaigns` — Campaign settings (daily limits, follow-ups, delays)
- `/app/analytics` — Analytics/reporting with charts
- `/app/integrations` — Gmail/Notion integration UI
- `/app/settings` — Profile settings with professional experience, skills, projects
- `/app/profile` — User profile page

### Backend Architecture
- **Runtime**: Express 5 on Node.js, served via `tsx` in development
- **Authentication**: Session-based auth with bcrypt password hashing, `express-session` with `connect-pg-simple` session store
- **Storage**: `DatabaseStorage` class using Drizzle ORM with PostgreSQL
- **API Routes**: 30+ REST endpoints covering auth, profile, contacts, campaigns, analytics, integrations, automation, AI email generation
- **AI Email Generation**: Intelligent fallback system that generates professional personalized emails without requiring an API key
- **Build**: Custom build script using esbuild for server + Vite for client, outputs to `dist/`

### Database Schema (PostgreSQL)
Full production schema with 10+ tables:
- `users` — User accounts (id, username, email, fullName, password hash)
- `user_profiles` — User professional profiles (skills, targetRoles, tone, currentStatus, etc.)
- `experiences` — Professional experience entries
- `projects` — Highlight project entries
- `contacts` — Contact management (name, email, company, role, status, notes)
- `campaign_settings` — Per-user campaign configuration (dailyLimit, followupCount, delays, priority)
- `email_sends` — Email send tracking (status, subject, body, timestamps)
- `daily_usage` — Daily email usage tracking
- `integrations` — OAuth integration connections (Gmail, Notion)
- `activity_logs` — Activity audit trail

### Field Name Mapping (DB → Frontend)
The API routes include a mapping layer to reconcile database column names with frontend expectations:
- `targetRoles` → `roles`
- `currentStatus` → `status`
- `profileDescription` → `description`
- `followupCount` → `followups`
- `followupDelays` → `delays`
- `priorityMode` → `priority`
- `balancedRatio` → `balanced`

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (Replit-managed)
- `SESSION_SECRET` — Secret for session encryption (stored as secret)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — Individual DB connection params

### Build & Development
- `npm run dev` — Starts the dev server with Vite HMR (port 5000)
- `npm run build` — Builds client (Vite) and server (esbuild) to `dist/`
- `npm run start` — Runs production build
- `npm run db:push` — Pushes Drizzle schema to database

## External Dependencies

### UI Framework
- **shadcn/ui** — Pre-built component library based on Radix UI primitives
- **Radix UI** — Headless UI primitives (dialog, dropdown, tabs, tooltip, etc.)
- **Tailwind CSS v4** — Utility-first CSS framework
- **Framer Motion** — Animation library (used on landing page)
- **Recharts** — Chart library (used in analytics)
- **Embla Carousel** — Carousel component

### Data & State
- **@tanstack/react-query** — Server state management
- **react-hook-form** — Form handling
- **zod** — Schema validation
- **drizzle-orm** + **drizzle-zod** — ORM and schema-to-validation bridge

### Database & Auth
- **PostgreSQL** — Production database (Replit-managed, Neon-backed)
- **connect-pg-simple** — PostgreSQL session store for express-session
- **bcrypt** — Password hashing
- **express-session** — Session management middleware

### Theming
- **next-themes** — Theme provider for dark/light/system mode

### Routing
- **wouter** — Lightweight client-side router

### Dev Tooling
- **Vite** — Frontend build tool and dev server
- **esbuild** — Server bundler for production
- **tsx** — TypeScript execution for development
- **drizzle-kit** — Database migration tooling
- **@replit/vite-plugin-runtime-error-modal** — Error overlay in development

### Automation & Services
- **node-cron** — Scheduler for automated email sending (5-min cycles) and reply checking (10-min cycles)
- **multer** — File upload middleware for CSV imports
- **googleapis** — Gmail API integration (OAuth2, send, reply detection)
- **@notionhq/client** — Notion API integration (OAuth2, contact import, status sync)
- **csv-parse** — CSV file parsing for contact imports

## Services Architecture
```
SaaS-Frontend/server/services/
├── gmail.ts           # Gmail OAuth2 flow, email sending, reply detection, token refresh
├── notion.ts          # Notion OAuth2 flow, contact import from databases, status sync-back
├── email-generator.ts # AI email generation with context memory, follow-up awareness, fallback
└── automation.ts      # node-cron scheduler with daily limits, priority modes, concurrency locks
```

### Automation Engine
- **Send cycle**: Runs every 5 minutes, processes active users, respects daily limits
- **Reply check**: Runs every 10 minutes, detects replies via Gmail API, updates contact status
- **Priority modes**: followups-first, fresh-first, balanced (configurable ratio)
- **Follow-up logic**: Configurable delays per follow-up (default: 2 days, 4 days)
- **Concurrency**: Locks prevent overlapping cycles
- **Email validation**: Contacts with invalid emails are skipped

### OAuth Integrations
- Gmail: OAuth2 flow → send emails via Gmail API, detect replies by threadId
- Notion: OAuth2 flow → import contacts from Notion databases, sync status changes back
- Both require client ID/secret environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET)

## Recent Changes
- 2026-02-13: Built full production backend with PostgreSQL database, authentication, 30+ API endpoints
- 2026-02-13: Connected all 7 frontend pages to real backend APIs (replaced all mock data)
- 2026-02-13: Added field name mapping layer between database schema and frontend expectations
- 2026-02-13: Implemented AI email generation with intelligent fallback (no API key required)
- 2026-02-15: Added CSV contact import with validation, deduplication, and error reporting
- 2026-02-15: Built Gmail OAuth service with email sending and reply detection
- 2026-02-15: Built Notion OAuth service with contact import and status sync-back
- 2026-02-15: Enhanced AI email generator with context memory and follow-up awareness
- 2026-02-15: Built automation engine with node-cron scheduler, daily limits, priority modes
- 2026-02-15: Fixed security: secure session cookies in production, concurrency locks, email validation
- 2026-02-15: Updated frontend with CSV upload dialog, OAuth redirect flows, Notion import UI

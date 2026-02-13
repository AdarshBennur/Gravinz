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

## Recent Changes
- 2026-02-13: Built full production backend with PostgreSQL database, authentication, 30+ API endpoints
- 2026-02-13: Connected all 7 frontend pages to real backend APIs (replaced all mock data)
- 2026-02-13: Added field name mapping layer between database schema and frontend expectations
- 2026-02-13: Implemented AI email generation with intelligent fallback (no API key required)

# replit.md

## Overview

OutboundAI is a modern SaaS frontend prototype for an AI-powered cold email automation platform targeting job seekers. It is a **frontend-only** application with no real backend logic — all data is mock/placeholder. The app includes a public landing page, authentication pages (login, signup, forgot password), and a full dashboard experience with contacts, campaigns, analytics, integrations, settings, and profile pages.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The project lives inside the `SaaS-Frontend/` directory and follows a fullstack monorepo layout, but the backend is essentially a shell — all meaningful logic is on the frontend.

```
SaaS-Frontend/
├── client/           # React frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI components (shadcn/ui + custom app components)
│   │   ├── pages/        # Route pages
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utilities, query client, mock API helpers
│   │   └── index.css     # Global styles with Tailwind CSS
│   └── index.html        # Entry HTML
├── server/           # Express server (minimal, serves static + placeholder routes)
├── shared/           # Shared schema (Drizzle ORM + Zod)
├── migrations/       # Drizzle migration output
└── attached_assets/  # Design spec documents
```

### Frontend Architecture
- **Framework**: React (not Next.js despite the original spec — uses Vite as build tool)
- **Routing**: `wouter` (lightweight client-side router) — not React Router
- **State Management**: `@tanstack/react-query` for async state; local React state for UI
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS v4 (using `@tailwindcss/vite` plugin), with CSS variables for theming
- **Theme Support**: `next-themes` for dark/light/system mode switching
- **Animations**: `framer-motion` for landing page animations
- **Mock Data**: All API calls use mock data via `lib/mock-api.ts` (`mockRequest` helper with simulated delays)
- **Path Aliases**: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`

### Key Pages & Routes
- `/` — Landing page (public marketing page)
- `/login`, `/signup`, `/forgot-password` — Auth pages (UI only, no real auth)
- `/app/dashboard` — Main dashboard with stats cards and activity table
- `/app/contacts` — Contact management
- `/app/campaigns` — Campaign settings
- `/app/analytics` — Analytics/reporting
- `/app/integrations` — Gmail/Notion integration UI
- `/app/settings` — Profile settings with professional experience, current status, highlight projects
- `/app/profile` — User profile page

### App Shell
The `components/app/app-shell.tsx` provides the authenticated layout with:
- Sidebar navigation (desktop) / Sheet navigation (mobile)
- Profile avatar icon in the header (navigates to profile page)
- Theme switcher dropdown (light/dark/system)

### Backend Architecture (Minimal)
- **Runtime**: Express 5 on Node.js, served via `tsx` in development
- **Purpose**: Serves the Vite dev server in development and static files in production
- **Storage**: In-memory storage (`MemStorage` class) with a simple user CRUD interface — no real database connection required for the frontend prototype
- **Build**: Custom build script using esbuild for server + Vite for client, outputs to `dist/`

### Database Schema (Placeholder)
- Uses Drizzle ORM with PostgreSQL dialect configured
- Single `users` table with `id`, `username`, `password` fields
- Schema validation via `drizzle-zod`
- Database is optional — the app works without it using `MemStorage`
- Run `npm run db:push` to sync schema if a `DATABASE_URL` is provided

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

### Database
- **PostgreSQL** — Target database (via `DATABASE_URL` env var)
- **connect-pg-simple** — Session store (available but not actively used)
- The app functions without a database using in-memory storage

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
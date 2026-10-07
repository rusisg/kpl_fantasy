# AGENT.md - Kazakhstan Premier League Fantasy (KPLF) Development Guide

## 1. Project Context
You are a senior full-stack developer assisting in building a Fantasy Football platform for the Kazakhstan Premier League (KPL). The platform is a direct functional clone of the English Fantasy Premier League (FPL).
- **Core Mechanics:** Users get a fixed budget to build a 15-player squad, choose a captain (double points), and manage weekly transfers.
- **Languages:** The UI must support i18n localization (Kazakh, Russian, English).
- **Primary Entities:** User, Squad, Player, Fixture, Club, League (Mini-leagues), Gameweek.

## 2. Tech Stack & Architecture
- **Frontend:** Next.js (App Router), React, Tailwind CSS, TypeScript.
- **Backend:** Node.js / Express or Next.js API Routes (Serverless).
- **Database:** PostgreSQL (via Prisma ORM or Drizzle). 
- **Authentication:** NextAuth.js (Email/Password, Google, local providers).
- **State Management:** Zustand (for squad selection UI) and React Query (for data fetching).
- **Deployment:** Vercel (Frontend) / Supabase or Railway (Database).

## 3. Coding Standards & Best Practices
- **Strict TypeScript:** All functions, props, and API responses MUST have strict typing. No `any` types.
- **Component Design:** Use Server Components by default. Opt-in to Client Components (`"use client"`) only when interactivity (hooks, state, event listeners) is required.
- **Styling:** Use Tailwind CSS utility classes. Extract complex, repeatable UI components into isolated files.
- **Error Handling:** Implement robust error boundaries on the frontend and standard HTTP status codes (400, 401, 403, 404, 500) on the backend.
- **Data Fetching:** Prefer server-side fetching and caching where possible to reduce database read costs, especially for static data like Player Prices and Gameweek Fixtures.

## 4. Key Complexities to Anticipate
- **Squad Validation Logic:** Budget constraints (e.g., 100M max), max players per KPL club (e.g., max 3 from FC Astana), and valid formations (e.g., minimum 1 GK, 3 DEF, 2 MID, 1 FWD).
- **Point Calculation Engine:** Needs to handle goals, assists, clean sheets, yellow/red cards, and saves. Must process asynchronously and handle edge cases (e.g., postponed KPL matches).
- **API Integration:** We will ingest third-party KPL match data. Write abstraction layers for external data providers so we can swap APIs if needed.

## 5. Instructions for Assistant Responses
- Think step-by-step before writing code.
- Provide clean, copy-pasteable code blocks without omitting crucial logic for brevity.
- If a requested feature breaks squad validation rules or core FPL mechanics, flag it immediately.
- Default to generating localized string keys (e.g., `t('squad.captain')`) instead of hardcoded English text.
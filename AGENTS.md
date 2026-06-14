# Repository Guidelines

## Project Structure & Module Organization
Pawnline is a Next.js App Router application for LINE LIFF pawn, investor, store, and drop-point workflows. Route pages and layouts live in `app/`, with role flows such as `app/investor`, `app/store`, `app/drop-point`, and `app/contract-actions`. Shared UI belongs in `components/`; reusable business logic and integrations belong in `lib/`, including `lib/db`, `lib/line`, `lib/liff`, `lib/security`, `lib/services`, and `lib/utils`. Database schema, seed data, and migrations live in `database/`. Operational helpers are in `scripts/`. Prefer `public/` for assets served directly by Next.js.

## Build, Test, and Development Commands
- `npm install`: install project dependencies from `package-lock.json`.
- `npm run dev`: start the local Next.js development server with Turbopack.
- `npm run build`: create a production build and surface TypeScript/Next.js errors.
- `npm run start`: serve the built app locally.
- `npm run lint`: run ESLint using Next.js core-web-vitals and TypeScript rules.
- `npm run setup-richmenu`, `npm run setup-richmenu-prod`, `npm run setup-richmenu-6`: configure LINE rich menus.
- `npm run test-s3`: validate S3 configuration; use only with the required environment variables.

## Coding Style & Naming Conventions
Use TypeScript and React functional components. Match nearby file style, generally 2-space indentation in TSX and concise named helpers. Components use `PascalCase`, hooks/utilities use `camelCase`, and route folders should stay lowercase or kebab-case. Use the `@/*` path alias for root imports. Keep `"use client"` limited to components that need browser APIs, React state, effects, LIFF, or direct interaction. Put API clients and sensitive logic in `lib/`, not page components.

## Testing Guidelines
There is currently no dedicated Jest, Vitest, or Playwright test suite. For every change, run `npm run lint` and `npm run build`, then manually verify the affected LIFF or role-based route. When adding tests, prefer colocated `*.test.ts` or `*.test.tsx` files, and document any new command in `package.json`.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries, for example `Update contract status for investor.` or `Droppoint bug fixed`. Keep commits focused on one behavior or workflow. Pull requests should include a summary, affected routes or scripts, required config changes, screenshots for UI changes, and validation notes listing lint, build, and manual checks.

## Security & Configuration Tips
Store secrets in `.env.local`; never commit `.env`, credentials, LINE tokens, MongoDB URIs, S3 keys, or webhook secrets. Update `.env.example` when introducing new required variables. For webhook, LIFF, rich menu, and deployment changes, cross-check the existing setup guides before editing production configuration.

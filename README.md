# EVEGAH Rider Main

This repository is separated into two apps.

- Frontend: Next.js app in Frontend
- Backend: Express and PostgreSQL API in Backend

## Setup

1. npm install
2. npm --prefix Frontend install
3. npm --prefix Backend install
4. Configure env files:
   - Frontend/.env.local from Frontend/.env.example
   - Backend/server/.env using Backend/.env.example as reference

## Run

- npm run dev
- npm run dev:frontend
- npm run dev:backend

## Build

- npm run build:frontend
- npm run build:backend

## Database

- npm run init:db
- docker compose -f docker-compose.postgres.yml up -d

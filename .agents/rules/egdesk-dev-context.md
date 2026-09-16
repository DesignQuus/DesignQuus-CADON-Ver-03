# EGDesk Development Context

This project was opened from **EGDesk**. The local dev server port is managed by EGDesk — use the values below.

## Active server

- **Dev server port:** 4005
- **Local preview URL:** http://localhost:4005
- **Server mode:** coding (dev)
- **Project:** C:\dev\CADON-Ver-03
- **EGDesk MCP/API:** http://localhost:8080

## Rules for agents

- Do **not** assume default ports — EGDesk is currently hosting this project on **port 4005** (`http://localhost:4005`).
- When referencing local preview or interacting with the app, use **port 4005** (`http://localhost:4005`).
- Do **not** start a redundant dev server on another port because EGDesk itself is actively hosting and managing the process on port 4005.
- Do not start a second dev server on a different port unless the user asks.
- EGDesk user-data helpers talk to MCP at `http://localhost:8080` (see `egdesk-helpers.ts` / `.env.local`).

_Updated automatically by EGDesk when this project is opened._

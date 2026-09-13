# Smart Timesheet

Automatic work intelligence — the desktop tracker captures what you actually worked on, so you never reconstruct a timesheet from memory again.

## Live Demo

https://smart-timesheet-ashen.vercel.app/

## GitHub

https://github.com/RAJASHREENIVASREDDY/smart-timesheet

## Problem

Manual timesheets fail in predictable ways:

- Users forget what they worked on by the end of the day or week.
- Activity gets reconstructed after the fact, so entries are guesses.
- Project attribution is difficult — time blends across apps, tabs, and tasks.
- Managers get hours without context, so they lack confidence in the data.

## Solution

Smart Timesheet inverts the flow: capture work continuously, then let the human review it.

```
Desktop Activity Collection
  → Activity Classification
  → Project Association
  → Confidence + Reason
  → Human Correction
  → Cloud Sync
  → Review / Approval
  → Reports / Export
```

The Electron tracker polls the active Windows application every 5 seconds, segments time into activities, classifies each one, associates it with a project, and explains its confidence. The Next.js dashboard presents the result for correction and approval, and exports the reviewed timesheet.

## Key Features

- Windows desktop activity tracking (active application + window detection)
- Automatic activity segmentation as focus changes
- Rule-based activity classification (Development, Design, Communication, Documentation, Research, Other)
- Keyword + learned project association
- Confidence score and human-readable reason per activity
- Human project correction with local learning (`corrections.json`)
- Local persistence (`activity-log.json`, survives restarts)
- Cloud synchronization with offline retry (batched, every 60s) and live sync (every 10s)
- Desktop sync-status indicator (Synced / Syncing / Offline-retrying / Error)
- Dashboard review queue, approve workflow, and correction editor
- Charts (category, distribution, daily trend, project breakdown)
- CSV, Excel, and PDF export
- Pause/resume tracking and CSV export in the desktop app

## Architecture

```
Electron desktop tracker (Windows)
  → Next.js API route (/api/activities, authenticated)
    → Appwrite Cloud (activities collection)
      → Next.js dashboard (reads Appwrite, review/approve/correct)
```

- The tracker keeps a full local history in Electron `userData` and syncs completed activities to the cloud. Unsynced work is retried in batches; live snapshots update the same Appwrite document via a stable activity ID, so retries never create duplicates.
- The API route authenticates the tracker via `x-desktop-tracker-key`, normalizes the payload to the exact Appwrite attribute set, and merges updates without overwriting human-corrected or approved records.
- The dashboard reads directly from Appwrite and refreshes every 10 seconds.

## Classification

The current production classifier is deterministic and rule-based. It uses application/window context and produces a category, confidence, and reason. No trained ML model is currently connected to the production tracking path.

Low-confidence or ambiguous activity (generic browser windows, unassigned projects) is flagged for human review instead of being silently accepted.

## Human-in-the-loop

- **Correction:** in the desktop app or the dashboard, the user reassigns an activity's project (and category, in the dashboard). Desktop corrections are remembered locally and bias future associations; dashboard corrections set `status: "corrected"`.
- **Approval:** one click in the dashboard sets `status: "approved"`.
- **Protection:** once an activity is corrected or approved, later tracker syncs update timing/metadata but never overwrite the human's project, category, or status.

## Tech Stack

- Next.js 16 (App Router) + React 19 + Tailwind CSS v4 — dashboard and API
- Electron 44 + Electron Forge — desktop tracker
- Appwrite Cloud — auth, database (`activities` collection); Appwrite JS SDK in the dashboard, REST from the API route
- Recharts, jsPDF, SheetJS (`xlsx`), `react-hot-toast` — dashboard visualization and export
- Plain HTML/CSS/JS renderer in the desktop app; PowerShell-based active-window detection on Windows
- Flask (`ml-api/`) — disconnected classification experiment, not in the production path

## Repository Structure

```
smart-timesheet/
├── app/
│   ├── page.tsx                  # dashboard (review, approve, charts, export)
│   └── api/activities/route.ts   # tracker auth, normalization, Appwrite sync
├── desktop-tracker/
│   ├── main.js                   # detection, classification, sync, IPC
│   ├── index.html                # tracker UI (live view, timesheet, corrections)
│   ├── timesheet.js              # local timesheet aggregation helpers
│   ├── projects.json             # project definitions + keywords
│   ├── corrections.json          # learned user corrections (local)
│   ├── package.json              # Electron app scripts and deps
│   └── forge.config.ts           # Electron Forge packaging/makers
├── ml-api/
│   └── app.py                    # disconnected experiment (not used in production)
├── public/
├── package.json                  # Next.js app scripts and deps
└── docs/
    ├── ARCHSCALE.md
    └── DEMO_SCRIPT.md
```

## Local Setup

Prerequisites: Node.js 20 LTS or newer.

```bash
# 1. Web app + API
npm install
npm run dev        # http://localhost:3000

# 2. Desktop tracker (new terminal)
cd desktop-tracker
npm install
npm run dev
```

Unpackaged (`npm run dev`), the tracker syncs to `http://localhost:3000/api/activities`; packaged builds sync to the production URL unless `SMART_TIMESHEET_API_URL` is set.

## Environment Variables

Names only — values live in `.env.local` (web app) and are never committed:

```
NEXT_PUBLIC_APPWRITE_ENDPOINT
NEXT_PUBLIC_APPWRITE_PROJECT
NEXT_PUBLIC_APPWRITE_DATABASE_ID
NEXT_PUBLIC_APPWRITE_COLLECTION_ID
APPWRITE_API_KEY
DESKTOP_TRACKER_API_KEY
```

`APPWRITE_API_KEY` is server-side only (API route). The desktop tracker only holds the tracker key, never the Appwrite key.

## Windows Desktop Build

`desktop-tracker/package.json` supports Electron Forge:

```bash
cd desktop-tracker
npm run package    # package the app
npm run make       # build installers (Squirrel for Windows, plus Zip/Rpm/Deb makers)
```

## ArchScale AS-04 Mapping

| AS-04 requirement | Implementation |
|---|---|
| Desktop Activity Collection | `desktop-tracker/main.js` — 5s Windows foreground-window polling, segmentation on focus change, local JSON persistence |
| Activity Classification | Rule-based classifier (app + title signals) emitting category, confidence, and reason |
| Project Association | Keyword matching against `projects.json` plus learned overrides from `corrections.json` |

Workflow followed: **Understand** (manual timesheets fail because recall fails) → **Question** (what if capture were continuous and reviewable?) → **Imagine** (a tracker that explains itself and accepts correction) → **Prototype** (Electron tracker + Next.js API + Appwrite + dashboard) → **Demonstrate** (live capture-to-report flow) → **Explain** (confidence/reasons, review queue, honest rule-based limits).

## Privacy

- Only the active application's name and window title are captured, for timesheet generation.
- Email-like patterns in window titles are redacted before storage/sync.
- The tracker never records its own window.
- Full history lives locally first; cloud sync carries the same fields the dashboard displays — no keystrokes, files, or screen content.
- The Appwrite API key never leaves the server; the desktop app authenticates with a separate tracker key.

## Known Limitations

- The classifier is rule-based, not a trained ML model.
- Generic or ambiguous browser activity can require human review (by design, it is flagged rather than guessed).
- Project configuration is static (`projects.json` plus learned corrections).
- Electron security hardening is limited by the current architecture (`nodeIntegration` on, no preload isolation) — acceptable for a local-only hackathon build.
- Active-window detection is Windows-only.

## Demo Flow

Capture → Classify → Associate → Review → Approve → Report

## Status

Working hackathon prototype for ArchScale AS-04. Real end-to-end flow: Windows activity → Electron tracker → Next.js API → Appwrite → dashboard → human correction/approval → export.

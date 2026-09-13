# Smart Timesheet — ArchScale AS-04 Work Intelligence

Challenge: **AS-04 "Reinvent the timesheet."**
Live demo: https://smart-timesheet-ashen.vercel.app/

## AS-04 Requirement Mapping

| Requirement | Where it lives | How it works |
|---|---|---|
| Desktop Activity Collection | `desktop-tracker/main.js` | Foreground-window polling every 5s on Windows; new activity on focus change; full local history in `activity-log.json` |
| Activity Classification | `classifyActivity` in `main.js` | Deterministic rules over application + window title → category, confidence, human-readable reason. Rule-based; no trained model in the production path |
| Project Association | `associateProject` + `findLearnedProject` in `main.js`, `projects.json` | Keyword scoring against project definitions, overridden by learned user corrections from `corrections.json` |

## 1. Understand

Manual timesheets depend on end-of-day recall. Recall is lossy: people forget short tasks, blend projects together, and backfill plausible-looking hours. The result is data nobody trusts — not the employee, not the manager. The core insight: the information exists at the moment of work (which app, which window, for how long) and is destroyed by waiting.

## 2. Question

What if capture were continuous and reviewable instead of reconstructed? That reframes the timesheet from a form to fill in into a draft to approve. It raises the real design questions: how do you segment a day into meaningful activities, how do you attribute them to projects without nagging the user, and how does the human stay in charge when the machine guesses wrong?

## 3. Imagine

A tracker that explains itself: every activity carries a category, a confidence, and a reason ("browser window indicates software development activity"). Uncertain calls are flagged for review rather than hidden. Corrections teach the system — correct once, and the same context is associated correctly next time. Sync is invisible but honest: the desktop app shows whether data actually reached the cloud.

## 4. Prototype

```
Electron tracker (Windows, 5s poll)
  → classification + project association (rule-based, with reasons)
  → POST /api/activities (x-desktop-tracker-key auth)
  → Next.js route: validate → normalize → Appwrite (stable doc ID per activity)
  → Next.js dashboard: live feed, charts, correct/approve, CSV/Excel/PDF export
```

Key engineering decisions:

- **Stable identity over event streaming.** Each activity gets one ID at creation; live snapshots and retries update the same Appwrite document (MD5 of the tracker ID, `endTime` deliberately excluded). No duplicates by construction, plus 409 conflict recovery for races.
- **Server-side merge protects humans.** Corrected/approved records keep their project, category, and status across future syncs; only timing and raw metadata refresh.
- **Local-first.** The tracker is fully usable offline — full history, timesheet, CSV export — and retries unsynced work in batches of 10 every 60s.
- **Fail visibly, not silently.** The API returns JSON errors (never HTML), the tracker logs the actual server message, and the desktop UI carries a sync-status pill (Synced / Syncing / Offline-retrying / Error).
- **No fake intelligence.** Ambiguous input yields moderate confidence and a review flag, not a confident guess. `ml-api/app.py` exists as an experiment and is deliberately not wired into the production path.

## 5. Demonstrate

The demo follows one workflow (see `docs/DEMO_SCRIPT.md`): use the computer → watch the tracker segment and classify live → see the activity land in the dashboard from Appwrite → correct a project → approve → export the report. Every step is real data; nothing is seeded or mocked.

## 6. Explain

- **Data flow:** window event → activity → classification + project + confidence + reason → local store → cloud upsert → dashboard → human decision → export.
- **Human-in-the-loop:** correction (desktop or dashboard) and approval (dashboard) are first-class; the sync layer is contractually forbidden from overwriting them.
- **Confidence/reasoning:** every automated decision is inspectable in both UIs; low-confidence work surfaces in a review queue.
- **Limitations (honest):** rule-based classifier, not trained ML; generic browser tabs need review; projects are statically configured; Electron hardening is limited by the current architecture; Windows-only detection.

## Product Decisions Worth Noting

1. Minutes in the cloud, seconds locally — the dashboard reasons in minutes; the tracker never loses precision it already has.
2. Review threshold over auto-accept — anything under 70% confidence, unassigned, or "Other" is flagged.
3. Correction learning stays local (`corrections.json`) — personal adaptation without polluting shared data.
4. Tracker key authenticates the device path; the Appwrite key never leaves the server.

# Smart Timesheet — 3–5 Minute Demo Script

Core story: "Instead of reconstructing a timesheet at the end of the day, Smart Timesheet continuously captures work activity, classifies it, associates it with a project, explains its confidence, lets the human correct it, and turns the reviewed activity into a usable timesheet."

Setup before recording: Next.js running (`npm run dev`), desktop tracker running (`cd desktop-tracker && npm run dev`), dashboard logged in and open, tracker window visible side-by-side.

## 0:00–0:30 — Problem

**WHAT TO SHOW:** Blank/mediocre spreadsheet timesheet, or the dashboard with no filter applied.

**WHAT TO SAY:** "Timesheets fail because they depend on memory. By Friday, nobody remembers what Tuesday looked like — so entries get reconstructed, projects get blended, and managers get hours without context. Smart Timesheet captures work as it happens, so review replaces recall."

## 0:30–1:15 — Desktop tracker

**WHAT TO SHOW:** The tracker window. Switch between two or three real apps (e.g., browser, VS Code, a document). Point at the live session timer, the current application/window boxes, and the sync-status pill next to TRACKING ACTIVE.

**WHAT TO SAY:** "Every five seconds the tracker notes the active application and window. When focus changes, it closes one activity and opens the next — duration, start and end times are recorded locally first, so this works fully offline. Watch the sync pill: it says Syncing while an upload is in flight and Synced with a timestamp once the server confirms it. If the network drops, it says Offline with the pending count and retries automatically."

## 1:15–2:00 — Activity classification

**WHAT TO SHOW:** A fresh activity in the Recent Activities list. Point at the category badge, the confidence percentage, and the reason line.

**WHAT TO SAY:** "Each activity is classified from its application and window context — I'll be upfront that this is a deterministic rule-based classifier, not a trained model. What matters is that it explains itself: here's the category, here's the confidence, and here's the reason in plain language. And when the signal is weak — say a generic browser tab — it keeps confidence low instead of guessing, which pushes the activity into the review queue."

## 2:00–2:45 — Project association + correction

**WHAT TO SHOW:** The project line on an activity (possibly Unassigned). Use the Correct Project dropdown, pick the right project, save. Note the 'learned' confirmation.

**WHAT TO SAY:** "Projects come from keyword matching plus anything I've corrected before — correct it once and the tracker remembers that context next time. But desktop correction is only half the story. The real authority is the dashboard, and the sync layer is forbidden from overwriting a human decision — once I correct or approve something there, future syncs update the timing but never touch my project or status."

## 2:45–3:30 — Dashboard review + approval

**WHAT TO SHOW:** Refresh the dashboard; the new activity appears. Open the Review filter, open the Correct modal on one item (change project + category), then Approve another. Show the status badges change.

**WHAT TO SAY:** "Everything lands here live, straight from the database — no mocks. The dashboard flags anything low-confidence, unassigned, or uncertain for review. I fix the project and category in one dialog, approve the good ones in one click, and the stats and charts update immediately."

## 3:30–4:00 — Reports / export

**WHAT TO SHOW:** Click CSV (open the file briefly), mention Excel and PDF. Scroll past the category/project breakdowns.

**WHAT TO SAY:** "The reviewed data becomes the report: one-click CSV, Excel with a summary sheet, or a formatted PDF — totals, category and project breakdowns included. This is the artifact a manager can actually trust, because every line survived human review."

## 4:00–4:30 — Architecture + closing

**WHAT TO SHOW:** Architecture diagram or the repo layout: `desktop-tracker/`, `app/api/activities/route.ts`, Appwrite, `app/page.tsx`.

**WHAT TO SAY:** "Under the hood: an Electron tracker captures and classifies, an authenticated Next.js API normalizes and upserts into Appwrite with stable per-activity IDs, and the dashboard reviews and exports. Local-first with honest sync status, human decisions protected by contract, and no pretended AI — the rules explain themselves, and a learned model is future work, not a claim. That's Smart Timesheet: capture continuously, explain everything, let the human decide."

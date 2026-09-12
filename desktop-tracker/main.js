const { app, BrowserWindow, ipcMain, dialog } = require("electron");

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const { generateTimesheet } = require("./timesheet");

// =====================================================
// CONFIGURATION
// =====================================================

const POLL_INTERVAL = 5000;
const LIVE_SYNC_INTERVAL = 10000;
const CLOUD_RETRY_INTERVAL = 60000;

const PRODUCTION_API_URL =
  "https://smart-timesheet-ashen.vercel.app/api/activities";

const LOCAL_API_URL = "http://localhost:3000/api/activities";

const API_URL =
  process.env.SMART_TIMESHEET_API_URL ||
  (app.isPackaged ? PRODUCTION_API_URL : LOCAL_API_URL);

const DESKTOP_TRACKER_API_KEY =
  process.env.SMART_TIMESHEET_TRACKER_KEY ||
  process.env.DESKTOP_TRACKER_API_KEY ||
  "smart-timesheet-desktop-2026";

console.log(`[Cloud Sync] API endpoint: ${API_URL}`);

// =====================================================
// GLOBAL STATE
// =====================================================

let mainWindow = null;

let tracking = true;

let currentActivity = null;

let activities = [];

let timesheetFilter = "today";

let detectionInProgress = false;

// Prevent duplicate cloud requests for the same activity.
const syncingActivities = new Set();

// =====================================================
// FILE STORAGE
// =====================================================

const DATA_FILE = path.join(app.getPath("userData"), "activity-log.json");

const CORRECTIONS_FILE = path.join(app.getPath("userData"), "corrections.json");

const PROJECTS_FILE = path.join(__dirname, "projects.json");

// =====================================================
// PRIVACY
// =====================================================

function sanitizeWindowTitle(title) {
  if (!title) {
    return "Unknown Window";
  }

  return String(title)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .trim();
}

// =====================================================
// TEXT HELPERS
// =====================================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

// =====================================================
// WINDOWS ACTIVE WINDOW DETECTION
// =====================================================

function getActiveWindowsWindow() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve(null);
      return;
    }

    const script = `
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class ActiveWindowHelper
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder text,
        int count
    );

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId
    );
}
'@

$handle = [ActiveWindowHelper]::GetForegroundWindow()

if ($handle -eq [IntPtr]::Zero) {
    exit
}

$builder = New-Object System.Text.StringBuilder 1024

[void][ActiveWindowHelper]::GetWindowText(
    $handle,
    $builder,
    $builder.Capacity
)

$processId = 0

[void][ActiveWindowHelper]::GetWindowThreadProcessId(
    $handle,
    [ref]$processId
)

if ($processId -le 0) {
    exit
}

try {
    $process = Get-Process -Id $processId -ErrorAction Stop

    $title = $builder.ToString()
    $name = $process.ProcessName
    $path = ""

    try {
        $path = $process.MainModule.FileName
    }
    catch {
        $path = ""
    }

    [PSCustomObject]@{
        title = $title
        processName = $name
        processId = $processId
        path = $path
    } | ConvertTo-Json -Compress
}
catch {
    [PSCustomObject]@{
        title = $builder.ToString()
        processName = "Unknown"
        processId = $processId
        path = ""
    } | ConvertTo-Json -Compress
}
`;

    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        timeout: 4000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          console.error("[Window Detection] PowerShell error:", error.message);

          resolve(null);
          return;
        }

        try {
          const output = String(stdout || "").trim();

          if (!output) {
            resolve(null);
            return;
          }

          const data = JSON.parse(output);

          resolve(data);
        } catch (parseError) {
          console.error(
            "[Window Detection] JSON parse error:",
            parseError.message,
          );

          resolve(null);
        }
      },
    );
  });
}

// =====================================================
// APPLICATION NAME
// =====================================================

function prettifyApplicationName(processName) {
  if (!processName) {
    return "Unknown Application";
  }

  const name = String(processName)
    .replace(/\.exe$/i, "")
    .trim();

  const knownNames = {
    chrome: "Google Chrome",
    msedge: "Microsoft Edge",
    firefox: "Mozilla Firefox",
    brave: "Brave",
    opera: "Opera",

    code: "Visual Studio Code",
    cursor: "Cursor",
    devenv: "Visual Studio",
    idea64: "IntelliJ IDEA",
    pycharm64: "PyCharm",
    webstorm64: "WebStorm",

    notepad: "Notepad",
    notepadplusplus: "Notepad++",

    winword: "Microsoft Word",
    excel: "Microsoft Excel",
    powerpnt: "Microsoft PowerPoint",

    slack: "Slack",
    teams: "Microsoft Teams",
    discord: "Discord",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    outlook: "Microsoft Outlook",

    figma: "Figma",
    photoshop: "Adobe Photoshop",
    illustrator: "Adobe Illustrator",
    blender: "Blender",

    explorer: "Windows Explorer",
    powershell: "PowerShell",
    cmd: "Command Prompt",
    WindowsTerminal: "Windows Terminal",
  };

  return knownNames[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

// =====================================================
// TRACKER IDENTIFICATION
// =====================================================

function isTrackerApplication(processName, application, title) {
  const processText = normalizeText(processName);
  const appText = normalizeText(application);
  const titleText = normalizeText(title);

  if (
    processText === "electron" &&
    (titleText.includes("smart timesheet tracker") ||
      titleText.includes("desktop tracker"))
  ) {
    return true;
  }

  if (
    appText.includes("smart timesheet tracker") ||
    appText.includes("desktop tracker")
  ) {
    return true;
  }

  return false;
}

// =====================================================
// ACTIVITY CLASSIFICATION
// =====================================================

function classifyActivity(application, windowTitle) {
  const appName = normalizeText(application);
  const title = normalizeText(windowTitle);

  const combined = `${appName} ${title}`;

  // ---------------------------------------------------
  // DEVELOPMENT
  // ---------------------------------------------------

  const developmentApps = [
    "visual studio code",
    "vs code",
    "cursor",
    "webstorm",
    "intellij",
    "pycharm",
    "eclipse",
    "android studio",
    "sublime text",
    "notepad++",
    "terminal",
    "command prompt",
    "powershell",
    "windows terminal",
    "git bash",
    "visual studio",
  ];

  const developmentSites = [
    "github",
    "gitlab",
    "bitbucket",
    "stackoverflow",
    "stack overflow",
    "developer.mozilla",
    "localhost",
    "127.0.0.1",
    "npm",
    "vercel",
  ];

  if (
    containsAny(appName, developmentApps) ||
    containsAny(title, developmentSites)
  ) {
    return {
      category: "Development",
      confidence: 0.97,
      reason:
        "A software development application or developer resource was detected.",
    };
  }

  // ---------------------------------------------------
  // DESIGN
  // ---------------------------------------------------

  const designKeywords = [
    "figma",
    "photoshop",
    "illustrator",
    "blender",
    "autocad",
    "sketchup",
    "revit",
    "canva",
    "adobe xd",
    "framer",
    "invision",
    "dribbble",
    "behance",
  ];

  if (containsAny(combined, designKeywords)) {
    return {
      category: "Design",
      confidence: 0.95,
      reason: "A design or visual-content workspace was detected.",
    };
  }

  // ---------------------------------------------------
  // COMMUNICATION
  // ---------------------------------------------------

  const communicationKeywords = [
    "slack",
    "microsoft teams",
    "teams",
    "zoom",
    "discord",
    "whatsapp",
    "telegram",
    "messenger",
    "google meet",
    "meet.google",
    "gmail",
    "outlook",
  ];

  if (containsAny(combined, communicationKeywords)) {
    return {
      category: "Communication",
      confidence: 0.94,
      reason:
        "A communication, messaging, email, or meeting application was detected.",
    };
  }

  // ---------------------------------------------------
  // DOCUMENTATION
  // ---------------------------------------------------

  const documentationKeywords = [
    "microsoft word",
    "word",
    "excel",
    "powerpoint",
    "google docs",
    "google sheets",
    "google slides",
    "notion",
    "confluence",
    "documentation",
    "readme",
  ];

  if (containsAny(combined, documentationKeywords)) {
    return {
      category: "Documentation",
      confidence: 0.92,
      reason:
        "A document, spreadsheet, presentation, or documentation workspace was detected.",
    };
  }

  // ---------------------------------------------------
  // BROWSERS
  // ---------------------------------------------------

  const browserApps = [
    "google chrome",
    "chrome",
    "microsoft edge",
    "msedge",
    "firefox",
    "mozilla firefox",
    "opera",
    "brave",
  ];

  if (containsAny(appName, browserApps)) {
    const communicationSignals = [
      "gmail",
      "outlook",
      "whatsapp",
      "discord",
      "slack",
      "teams",
      "messenger",
      "meet",
      "zoom",
    ];

    const designSignals = [
      "figma",
      "canva",
      "photoshop",
      "dribbble",
      "behance",
    ];

    const developmentSignals = [
      "github",
      "gitlab",
      "stackoverflow",
      "stack overflow",
      "localhost",
      "npm",
      "vercel",
      "developer.mozilla",
      "mdn",
      "w3schools",
      "geeksforgeeks",
    ];

    const researchSignals = [
      "google",
      "wikipedia",
      "research",
      "documentation",
      "article",
      "paper",
      "journal",
      "tutorial",
      "reference",
      "arxiv",
    ];

    if (containsAny(title, communicationSignals)) {
      return {
        category: "Communication",
        confidence: 0.9,
        reason: "The browser window indicates online communication.",
      };
    }

    if (containsAny(title, designSignals)) {
      return {
        category: "Design",
        confidence: 0.9,
        reason: "The browser window indicates a design workspace.",
      };
    }

    if (containsAny(title, developmentSignals)) {
      return {
        category: "Development",
        confidence: 0.9,
        reason: "The browser window indicates software development activity.",
      };
    }

    if (containsAny(title, researchSignals)) {
      return {
        category: "Research",
        confidence: 0.88,
        reason:
          "The browser window indicates research or information gathering.",
      };
    }

    return {
      category: "Research",
      confidence: 0.6,
      reason:
        "A browser was detected but the window title did not provide enough context for a more specific classification.",
    };
  }

  // ---------------------------------------------------
  // RESEARCH
  // ---------------------------------------------------

  const researchKeywords = [
    "research",
    "wikipedia",
    "journal",
    "paper",
    "arxiv",
    "documentation",
    "mdn",
    "tutorial",
  ];

  if (containsAny(combined, researchKeywords)) {
    return {
      category: "Research",
      confidence: 0.88,
      reason:
        "The application or window title indicates research or information gathering.",
    };
  }

  // ---------------------------------------------------
  // OTHER
  // ---------------------------------------------------

  return {
    category: "Other",
    confidence: 0.5,
    reason:
      "There was not enough contextual information to assign a more specific category.",
  };
}

// =====================================================
// PROJECTS
// =====================================================

function loadProjects() {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8"));

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Could not load projects:", error);

    return [];
  }
}

// =====================================================
// CORRECTIONS
// =====================================================

function loadCorrections() {
  try {
    if (!fs.existsSync(CORRECTIONS_FILE)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(CORRECTIONS_FILE, "utf8"));

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Could not load corrections:", error);

    return [];
  }
}

function saveCorrection(correction) {
  try {
    const corrections = loadCorrections();

    corrections.push({
      ...correction,
      correctedAt: new Date().toISOString(),
    });

    fs.writeFileSync(
      CORRECTIONS_FILE,
      JSON.stringify(corrections, null, 2),
      "utf8",
    );

    return true;
  } catch (error) {
    console.error("Could not save correction:", error);

    return false;
  }
}

// =====================================================
// LEARNED PROJECT ASSOCIATION
// =====================================================

function findLearnedProject(application, windowTitle) {
  const corrections = loadCorrections();

  const appText = normalizeText(application);
  const titleText = normalizeText(windowTitle);

  for (let i = corrections.length - 1; i >= 0; i--) {
    const correction = corrections[i];

    if (
      !correction.correctedProject ||
      correction.correctedProject === "Unassigned"
    ) {
      continue;
    }

    const correctionApp = normalizeText(correction.application);

    const correctionTitle = normalizeText(correction.windowTitle);

    if (correctionApp === appText && correctionTitle === titleText) {
      return {
        projectId: correction.projectId || null,

        projectName: correction.correctedProject,

        confidence: 0.99,

        reason:
          "Matched a previous user correction for the same application and window.",
      };
    }

    if (
      correctionApp === appText &&
      correctionTitle &&
      titleText.includes(correctionTitle)
    ) {
      return {
        projectId: correction.projectId || null,

        projectName: correction.correctedProject,

        confidence: 0.95,

        reason:
          "Matched a previous user correction with similar activity context.",
      };
    }
  }

  return null;
}

// =====================================================
// PROJECT ASSOCIATION
// =====================================================

function associateProject(application, windowTitle) {
  const learned = findLearnedProject(application, windowTitle);

  if (learned) {
    return learned;
  }

  const projects = loadProjects();

  const appText = normalizeText(application);
  const titleText = normalizeText(windowTitle);

  const combined = `${appText} ${titleText}`;

  let bestProject = null;
  let bestScore = 0;
  let bestKeyword = "";

  for (const project of projects) {
    if (!project || !Array.isArray(project.keywords)) {
      continue;
    }

    for (const keyword of project.keywords) {
      const key = normalizeText(keyword);

      if (!key) {
        continue;
      }

      let score = 0;

      if (titleText.includes(key)) {
        score = 0.97;
      } else if (appText.includes(key)) {
        score = 0.9;
      } else if (combined.includes(key)) {
        score = 0.85;
      }

      if (score > bestScore) {
        bestScore = score;
        bestProject = project;
        bestKeyword = keyword;
      }
    }
  }

  if (!bestProject) {
    return {
      projectId: null,

      projectName: "Unassigned",

      confidence: 0.3,

      reason: "No project-specific keyword was found in the activity context.",
    };
  }

  return {
    projectId: bestProject.id || null,

    projectName: bestProject.name || "Unassigned",

    confidence: bestScore,

    reason: `Matched project keyword "${bestKeyword}" in the activity context.`,
  };
}

// =====================================================
// LOCAL STORAGE
// =====================================================

function loadActivities() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      activities = [];
      return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (Array.isArray(data)) {
      activities = data;
    } else if (data && Array.isArray(data.activities)) {
      activities = data.activities;
    } else {
      activities = [];
    }

    activities = activities.filter(
      (activity) => activity && typeof activity === "object",
    );
  } catch (error) {
    console.error("Could not load activity data:", error);

    activities = [];
  }
}

function saveActivities() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(activities, null, 2), "utf8");
  } catch (error) {
    console.error("Could not save activity data:", error);
  }
}

// =====================================================
// CLOUD PAYLOAD
// =====================================================

function buildCloudPayload(activity, endTimeOverride = null) {
  const seconds = Number(activity.duration) || 0;

  const minutes = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;

  return {
    id: activity.id,

    activityId: activity.id,

    application: activity.application || "Unknown Application",

    appName: activity.application || "Unknown Application",

    windowTitle: activity.windowTitle || "Unknown Window",

    startTime: activity.startTime || "",

    endTime: endTimeOverride || activity.endTime || "",

    duration: minutes,

    category: activity.category || "Other",

    confidence: Number(activity.confidence) || 0,

    projectId: activity.projectId || "",

    projectName: activity.projectName || "Unassigned",

    projectConfidence: Number(activity.projectConfidence) || 0,

    classificationReason: activity.reason || "",

    projectReason: activity.projectReason || "",

    source: "desktop-tracker",
  };
}

// =====================================================
// CLOUD SYNC
// =====================================================

async function syncActivityToCloud(activity, options = {}) {
  if (!activity || !activity.id) {
    return false;
  }

  const allowRunning = options.allowRunning === true;

  const markSynced = options.markSynced !== false;

  if (!activity.endTime && !allowRunning) {
    return false;
  }

  if (markSynced && activity.cloudSynced === true) {
    return true;
  }

  if (syncingActivities.has(activity.id)) {
    return false;
  }

  syncingActivities.add(activity.id);

  try {
    let endTime = activity.endTime;

    if (!endTime && allowRunning) {
      endTime = new Date().toISOString();
    }

    const payload = buildCloudPayload(activity, endTime);

    console.log(
      `[Cloud Sync] Uploading: ${activity.application} | ${payload.duration} min`,
    );

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        "x-desktop-tracker-key": DESKTOP_TRACKER_API_KEY,
      },

      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        message: responseText,
      };
    }

    if (!response.ok) {
      const serverError =
        responseData?.error || responseData?.message || `HTTP ${response.status}`;

      const serverDetails = responseData?.details
        ? ` | Details: ${responseData.details}`
        : "";

      throw new Error(`${serverError}${serverDetails} (HTTP ${response.status})`);
    }

    if (markSynced) {
      const index = activities.findIndex((item) => item.id === activity.id);

      if (index !== -1) {
        activities[index] = {
          ...activities[index],

          cloudSynced: true,

          cloudSyncedAt: new Date().toISOString(),
        };

        saveActivities();
      }
    }

    console.log(`[Cloud Sync] Success: ${activity.application}`);

    return true;
  } catch (error) {
    console.error(
      `[Cloud Sync] Failed for ${activity.application}:`,
      error?.message || error,
    );

    return false;
  } finally {
    syncingActivities.delete(activity.id);
  }
}

// =====================================================
// LIVE CLOUD SYNC
// =====================================================

async function syncCurrentActivityToCloud() {
  if (!tracking || !currentActivity) {
    return;
  }

  refreshCurrentActivityDuration();

  const snapshot = {
    ...currentActivity,

    duration: currentActivity.duration,

    endTime: null,
  };

  await syncActivityToCloud(snapshot, {
    allowRunning: true,
    markSynced: false,
  });
}

// =====================================================
// RETRY UNSYNCED COMPLETED ACTIVITIES
// =====================================================

async function syncUnsyncedActivities() {
  const unsynced = activities.filter(
    (activity) => activity && activity.endTime && activity.cloudSynced !== true,
  );

  if (unsynced.length === 0) {
    return;
  }

  console.log(
    `[Cloud Sync] ${unsynced.length} unsynced completed activity(s) found.`,
  );

  const batch = unsynced.slice(-10);

  for (const activity of batch) {
    await syncActivityToCloud(activity);
  }
}

// =====================================================
// CREATE ACTIVITY
// =====================================================

function createActivity(application, rawWindowTitle, startTime) {
  const safeTitle = sanitizeWindowTitle(rawWindowTitle);

  const classification = classifyActivity(application, safeTitle);

  const project = associateProject(application, safeTitle);

  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,

    application: application || "Unknown Application",

    windowTitle: safeTitle,

    startTime: new Date(startTime).toISOString(),

    endTime: null,

    duration: 0,

    category: classification.category,

    confidence: classification.confidence,

    reason: classification.reason,

    projectId: project.projectId,

    projectName: project.projectName,

    projectConfidence: project.confidence,

    projectReason: project.reason,

    cloudSynced: false,

    cloudSyncedAt: null,
  };
}

// =====================================================
// COMPLETE CURRENT ACTIVITY
// =====================================================

function updateCurrentActivity(now) {
  if (!currentActivity) {
    return;
  }

  const start = new Date(currentActivity.startTime).getTime();

  if (Number.isNaN(start)) {
    return;
  }

  currentActivity.duration = Math.max(0, Math.floor((now - start) / 1000));

  currentActivity.endTime = new Date(now).toISOString();

  const index = activities.findIndex(
    (activity) => activity.id === currentActivity.id,
  );

  if (index !== -1) {
    activities[index] = {
      ...currentActivity,
    };
  } else {
    activities.push({
      ...currentActivity,
    });
  }

  saveActivities();
}

// =====================================================
// REFRESH RUNNING ACTIVITY DURATION
// =====================================================

function refreshCurrentActivityDuration() {
  if (!currentActivity) {
    return;
  }

  const start = new Date(currentActivity.startTime).getTime();

  if (Number.isNaN(start)) {
    return;
  }

  currentActivity.duration = Math.max(
    0,
    Math.floor((Date.now() - start) / 1000),
  );

  currentActivity.endTime = null;

  const index = activities.findIndex(
    (activity) => activity.id === currentActivity.id,
  );

  if (index !== -1) {
    activities[index] = {
      ...currentActivity,
    };
  }
}

// =====================================================
// SEND STATE TO UI
// =====================================================

function sendState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  refreshCurrentActivityDuration();

  const timesheet = generateTimesheet(activities, timesheetFilter);

  mainWindow.webContents.send("tracker-state", {
    tracking,

    currentActivity,

    activities: activities.slice(-20).reverse(),

    timesheet,
  });
}

// =====================================================
// ACTIVE WINDOW CHECK
// =====================================================

async function checkActiveWindow() {
  if (!tracking) {
    return;
  }

  if (detectionInProgress) {
    return;
  }

  detectionInProgress = true;

  try {
    const window = await getActiveWindowsWindow();

    if (!window) {
      console.log("[Window Detection] No active window detected.");

      return;
    }

    const processName = window.processName || "Unknown";

    const application = prettifyApplicationName(processName);

    const rawTitle = window.title || "Unknown Window";

    console.log(`[Window Detection] ${application} | ${rawTitle}`);

    // Never track the tracker itself.
    if (isTrackerApplication(processName, application, rawTitle)) {
      return;
    }

    const title = sanitizeWindowTitle(rawTitle);

    const now = Date.now();

    // -------------------------------------------------
    // FIRST ACTIVITY
    // -------------------------------------------------

    if (!currentActivity) {
      currentActivity = createActivity(application, title, now);

      activities.push({
        ...currentActivity,
      });

      saveActivities();

      sendState();

      console.log(`[Tracker] Started: ${application} | ${title}`);

      syncCurrentActivityToCloud();

      return;
    }

    // -------------------------------------------------
    // SAME WINDOW
    // -------------------------------------------------

    const sameActivity =
      currentActivity.application === application &&
      currentActivity.windowTitle === title;

    if (sameActivity) {
      refreshCurrentActivityDuration();

      sendState();

      return;
    }

    // -------------------------------------------------
    // WINDOW CHANGED
    // -------------------------------------------------

    updateCurrentActivity(now);

    const completedActivity = {
      ...currentActivity,
    };

    console.log(
      `[Tracker] Completed: ${completedActivity.application} | ${completedActivity.windowTitle} | ${completedActivity.duration}s`,
    );

    currentActivity = createActivity(application, title, now);

    activities.push({
      ...currentActivity,
    });

    saveActivities();

    sendState();

    console.log(`[Tracker] Started: ${application} | ${title}`);

    // Upload completed activity.
    syncActivityToCloud(completedActivity);

    // Upload new running activity.
    syncCurrentActivityToCloud();
  } catch (error) {
    console.error("[Window Detection] Failed:", error);
  } finally {
    detectionInProgress = false;
  }
}

// =====================================================
// ELECTRON WINDOW
// =====================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,

    height: 750,

    minWidth: 850,

    minHeight: 600,

    webPreferences: {
      nodeIntegration: true,

      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// =====================================================
// APPLICATION STARTUP
// =====================================================

app.whenReady().then(() => {
  // Load previously recorded activities.
  loadActivities();

  // Create tracker window.
  createWindow();

  // Detect active application every 5 seconds.
  setInterval(checkActiveWindow, POLL_INTERVAL);

  // Initial detection.
  setTimeout(checkActiveWindow, 1000);

  // Retry unsynced completed activities.
  setTimeout(syncUnsyncedActivities, 3000);

  setInterval(syncUnsyncedActivities, CLOUD_RETRY_INTERVAL);

  // Live cloud synchronization.
  setInterval(syncCurrentActivityToCloud, LIVE_SYNC_INTERVAL);

  // ===================================================
  // PAUSE TRACKING
  // ===================================================

  ipcMain.on("pause-tracking", () => {
    if (currentActivity) {
      updateCurrentActivity(Date.now());

      const completed = {
        ...currentActivity,
      };

      tracking = false;

      currentActivity = null;

      saveActivities();

      sendState();

      syncActivityToCloud(completed);

      return;
    }

    tracking = false;

    sendState();
  });

  // ===================================================
  // RESUME TRACKING
  // ===================================================

  ipcMain.on("resume-tracking", () => {
    tracking = true;

    currentActivity = null;

    sendState();

    setTimeout(checkActiveWindow, 100);
  });

  // ===================================================
  // GET STATE
  // ===================================================

  ipcMain.on("get-state", () => {
    sendState();
  });

  // ===================================================
  // TIMESHEET FILTER
  // ===================================================

  ipcMain.on("change-timesheet-filter", (event, filter) => {
    if (filter !== "today" && filter !== "all") {
      return;
    }

    timesheetFilter = filter;

    sendState();
  });

  // ===================================================
  // EXPORT CSV
  // ===================================================

  ipcMain.on("export-timesheet-csv", async () => {
    refreshCurrentActivityDuration();

    const timesheet = generateTimesheet(activities, timesheetFilter);

    const rows = [
      [
        "Project",
        "Category",
        "Application",
        "Window",
        "Start Time",
        "End Time",
        "Duration (seconds)",
        "Confidence",
      ],
    ];

    for (const activity of timesheet.activities) {
      rows.push([
        activity.projectName || "Unassigned",

        activity.category || "Other",

        activity.application || "",

        activity.windowTitle || "",

        activity.startTime || "",

        activity.endTime || "",

        Number(activity.duration) || 0,

        Number(activity.confidence) || 0,
      ]);
    }

    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");

            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Timesheet",

      defaultPath: `timesheet-${timesheetFilter}.csv`,

      filters: [
        {
          name: "CSV Files",

          extensions: ["csv"],
        },
      ],
    });

    if (result.canceled || !result.filePath) {
      return;
    }

    try {
      fs.writeFileSync(result.filePath, csv, "utf8");

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("export-complete", result.filePath);
      }
    } catch (error) {
      console.error("Could not export timesheet:", error);
    }
  });

  // ===================================================
  // PROJECT CORRECTION
  // ===================================================

  ipcMain.on("correct-project", (event, correction) => {
    if (!correction) {
      return;
    }

    const activity = activities.find(
      (item) => item.id === correction.activityId,
    );

    if (!activity) {
      console.error("Activity not found:", correction.activityId);

      return;
    }

    const previousProject = activity.projectName || "Unassigned";

    const correctedProject = correction.projectName || "Unassigned";

    // Update activity.
    activity.projectId = correction.projectId || null;

    activity.projectName = correctedProject;

    activity.projectConfidence = 1;

    activity.projectReason = "Project manually confirmed by the user.";

    // Update currently running activity.
    if (currentActivity && currentActivity.id === correction.activityId) {
      currentActivity.projectId = correction.projectId || null;

      currentActivity.projectName = correctedProject;

      currentActivity.projectConfidence = 1;

      currentActivity.projectReason = "Project manually confirmed by the user.";
    }

    // Save correction for future learning.
    saveCorrection({
      activityId: correction.activityId,

      application: activity.application,

      windowTitle: activity.windowTitle,

      previousProject,

      correctedProject,

      projectId: correction.projectId || null,
    });

    // Force re-sync.
    activity.cloudSynced = false;

    activity.cloudSyncedAt = null;

    if (currentActivity && currentActivity.id === correction.activityId) {
      currentActivity.cloudSynced = false;

      currentActivity.cloudSyncedAt = null;
    }

    saveActivities();

    sendState();

    // -------------------------------------------------
    // SYNC CORRECTION
    // -------------------------------------------------

    if (activity.endTime) {
      syncActivityToCloud({
        ...activity,
      });
    } else {
      syncActivityToCloud(
        {
          ...activity,
          endTime: null,
        },
        {
          allowRunning: true,
          markSynced: false,
        },
      );
    }
  });
});

// =====================================================
// CLOSE
// =====================================================

app.on("window-all-closed", () => {
  if (currentActivity) {
    updateCurrentActivity(Date.now());

    const completed = {
      ...currentActivity,
    };

    currentActivity = null;

    saveActivities();

    // Best-effort final upload.
    syncActivityToCloud(completed);
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

// =====================================================
// MACOS
// =====================================================

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

import { NextRequest, NextResponse } from "next/server";

const APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";

const APPWRITE_PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const APPWRITE_DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const APPWRITE_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const DESKTOP_TRACKER_API_KEY = process.env.DESKTOP_TRACKER_API_KEY;

type ActivityPayload = {
  application?: string;
  appName?: string;
  windowTitle?: string;

  startTime?: string;
  endTime?: string;

  duration?: number;

  category?: string;
  confidence?: number;

  projectId?: string;
  projectName?: string;
  project?: string;
  projectConfidence?: number;

  classificationReason?: string;
  projectReason?: string;

  source?: string;
};

function validateConfiguration() {
  const missing: string[] = [];

  if (!APPWRITE_PROJECT) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT");
  if (!APPWRITE_DATABASE_ID) missing.push("NEXT_PUBLIC_APPWRITE_DATABASE_ID");
  if (!APPWRITE_COLLECTION_ID)
    missing.push("NEXT_PUBLIC_APPWRITE_COLLECTION_ID");
  if (!APPWRITE_API_KEY) missing.push("APPWRITE_API_KEY");
  if (!DESKTOP_TRACKER_API_KEY) missing.push("DESKTOP_TRACKER_API_KEY");

  return missing;
}

function isValidNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCategory(category?: string) {
  if (!category) return "Other";

  return category
    .replace(/^🎨\s*/, "")
    .replace(/^💻\s*/, "")
    .replace(/^📧\s*/, "")
    .replace(/^📊\s*/, "")
    .replace(/^🔍\s*/, "")
    .replace(/^📌\s*/, "")
    .trim();
}

function normalizeActivity(payload: ActivityPayload) {
  const application =
    payload.application?.trim() || payload.appName?.trim() || "Unknown";

  const projectName =
    payload.projectName?.trim() || payload.project?.trim() || "Unassigned";

  const duration = isValidNumber(payload.duration)
    ? Math.max(0, Math.round(payload.duration))
    : 0;

  const confidence = isValidNumber(payload.confidence)
    ? Math.min(1, Math.max(0, payload.confidence))
    : 0;

  const projectConfidence = isValidNumber(payload.projectConfidence)
    ? Math.min(1, Math.max(0, payload.projectConfidence))
    : 0;

  return {
    // Existing dashboard fields
    appName: application,
    duration,
    category: normalizeCategory(payload.category),
    project: projectName,

    // Desktop intelligence
    application,
    windowTitle: payload.windowTitle?.trim() || "",
    startTime: payload.startTime || "",
    endTime: payload.endTime || "",

    confidence,
    projectId: payload.projectId?.trim() || "",
    projectName,
    projectConfidence,

    classificationReason: payload.classificationReason?.trim() || "",

    projectReason: payload.projectReason?.trim() || "",

    source: payload.source?.trim() || "desktop-tracker",

    // Useful for the current dashboard
    status: "pending",
  };
}

/**
 * POST /api/activities
 *
 * Used by the Electron desktop tracker to upload
 * a completed activity to Appwrite.
 */
export async function POST(request: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Validate server configuration
    // --------------------------------------------------

    const missing = validateConfiguration();

    if (missing.length > 0) {
      console.error("Missing environment variables:", missing);

      return NextResponse.json(
        {
          success: false,
          error: "Server configuration is incomplete.",
          missing,
        },
        { status: 500 },
      );
    }

    // --------------------------------------------------
    // 2. Authenticate desktop tracker
    // --------------------------------------------------

    const trackerKey = request.headers.get("x-desktop-tracker-key");

    if (!trackerKey || trackerKey !== DESKTOP_TRACKER_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized desktop tracker request.",
        },
        { status: 401 },
      );
    }

    // --------------------------------------------------
    // 3. Parse request
    // --------------------------------------------------

    const payload = (await request.json()) as ActivityPayload;

    // --------------------------------------------------
    // 4. Validate activity
    // --------------------------------------------------

    const application = payload.application?.trim() || payload.appName?.trim();

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          error: "application/appName is required.",
        },
        { status: 400 },
      );
    }

    if (payload.duration !== undefined && !isValidNumber(payload.duration)) {
      return NextResponse.json(
        {
          success: false,
          error: "duration must be a valid number.",
        },
        { status: 400 },
      );
    }

    // --------------------------------------------------
    // 5. Normalize activity
    // --------------------------------------------------

    const activity = normalizeActivity(payload);

    // --------------------------------------------------
    // 6. Create Appwrite document
    // --------------------------------------------------

    const url =
      `${APPWRITE_ENDPOINT}/databases/` +
      `${encodeURIComponent(APPWRITE_DATABASE_ID!)}/collections/` +
      `${encodeURIComponent(APPWRITE_COLLECTION_ID!)}/documents`;

    const appwriteResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": APPWRITE_PROJECT!,
        "X-Appwrite-Key": APPWRITE_API_KEY!,
      },
      body: JSON.stringify({
        documentId: "unique()",
        data: activity,
      }),
      cache: "no-store",
    });

    const responseText = await appwriteResponse.text();

    let responseData: any;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        message: responseText,
      };
    }

    // --------------------------------------------------
    // 7. Handle Appwrite errors
    // --------------------------------------------------

    if (!appwriteResponse.ok) {
      console.error("Appwrite error:", responseData);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save activity to Appwrite.",
          details: responseData,
        },
        { status: appwriteResponse.status },
      );
    }

    // --------------------------------------------------
    // 8. Success
    // --------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        message: "Activity uploaded successfully.",
        activity: responseData,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("POST /api/activities error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error.",
        message: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/activities
 *
 * Simple health/configuration check.
 */
export async function GET(request: NextRequest) {
  const trackerKey = request.headers.get("x-desktop-tracker-key");

  if (!trackerKey || trackerKey !== DESKTOP_TRACKER_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  const missing = validateConfiguration();

  if (missing.length > 0) {
    return NextResponse.json(
      {
        success: false,
        configured: false,
        missing,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    configured: true,
    service: "Smart Timesheet Activities API",
    version: "1.0.0",
  });
}

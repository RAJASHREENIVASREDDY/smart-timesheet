import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPWRITE_ENDPOINT = (
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1"
).replace(/\/+$/, "");

const APPWRITE_PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const APPWRITE_DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const APPWRITE_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;

const DESKTOP_TRACKER_API_KEY = process.env.DESKTOP_TRACKER_API_KEY;

type ActivityPayload = {
  id?: string;
  activityId?: string;

  application?: string;
  appName?: string;
  windowTitle?: string;

  startTime?: string;
  endTime?: string;

  duration?: number;

  category?: string;
  classification?: string;
  confidence?: number;

  project?: string;
  projectName?: string;
  projectId?: string;
  projectConfidence?: number;

  reasons?: string[];
  classificationReason?: string;
  projectReason?: string;
  source?: string;

  status?: string;
};

type AppwriteDocument = {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;

  [key: string]: any;
};

type NormalizedActivity = {
  application: string;
  appName: string;
  windowTitle: string;

  startTime: string;
  endTime: string;
  duration: number;

  category: string;
  classification: string;
  confidence: number;

  project: string;
  projectName: string;
  projectId: string;
  projectConfidence: number;

  classificationReason: string;
  projectReason: string;
  source: string;

  status: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCategory(category?: string, classification?: string): string {
  const raw = (category || classification || "Other").trim();

  const cleaned = raw
    .replace(/^[^\w]+/, "")
    .replace(/[^\w\s/&-]+$/, "")
    .trim();

  const categories = [
    "Development",
    "Design",
    "Communication",
    "Documentation",
    "Research",
    "Other",
  ];

  const match = categories.find(
    (item) => item.toLowerCase() === cleaned.toLowerCase(),
  );

  return match || "Other";
}

function normalizeStatus(status?: string): string {
  const allowed = [
    "pending",
    "approved",
    "corrected",
    "needs_review",
    "review",
  ];

  if (!status) {
    return "pending";
  }

  const normalized = status.trim().toLowerCase();

  return allowed.includes(normalized) ? normalized : "pending";
}

function normalizeActivity(payload: ActivityPayload): NormalizedActivity {
  const application =
    payload.application?.trim() || payload.appName?.trim() || "Unknown";

  const windowTitle = payload.windowTitle?.trim() || "";

  const startTime = payload.startTime || new Date().toISOString();

  const endTime = payload.endTime || startTime;

  const numericDuration = Number(payload.duration ?? 0);

  const duration = Number.isFinite(numericDuration)
    ? Math.max(0, Math.round(numericDuration))
    : 0;

  const numericConfidence = Number(payload.confidence);

  const confidence = clamp(
    Number.isFinite(numericConfidence) ? numericConfidence : 0.5,
  );

  const numericProjectConfidence = Number(payload.projectConfidence);

  const projectConfidence = clamp(
    Number.isFinite(numericProjectConfidence) ? numericProjectConfidence : 0.5,
  );

  const category = normalizeCategory(payload.category, payload.classification);

  const project =
    payload.project?.trim() || payload.projectName?.trim() || "Unassigned";

  const projectName =
    payload.projectName?.trim() || payload.project?.trim() || "Unassigned";

  const projectId = payload.projectId?.trim() || "";

  const reasonList = Array.isArray(payload.reasons)
    ? payload.reasons.filter(
        (reason): reason is string => typeof reason === "string",
      )
    : [];

  const classificationReason = (
    payload.classificationReason?.trim() ||
    reasonList[0] ||
    ""
  ).slice(0, 500);

  const projectReason = (
    payload.projectReason?.trim() ||
    reasonList[1] ||
    ""
  ).slice(0, 500);

  const source = payload.source?.trim() || "desktop-tracker";

  return {
    application,
    appName: application,
    windowTitle,

    startTime,
    endTime,
    duration,

    category,
    classification: category,
    confidence,

    project,
    projectName,
    projectId,
    projectConfidence,

    classificationReason,
    projectReason,
    source,

    status: normalizeStatus(payload.status),
  };
}

/**
 * Generates a deterministic Appwrite document ID.
 *
 * IMPORTANT:
 * endTime is intentionally NOT used.
 *
 * The desktop tracker sends live snapshots where
 * endTime changes every few seconds. Including endTime
 * would create duplicate Appwrite documents.
 *
 * Priority:
 * 1. activityId
 * 2. id
 * 3. application + windowTitle + startTime
 */
function generateActivityDocumentId(payload: ActivityPayload): string {
  const trackerActivityId = payload.activityId?.trim() || payload.id?.trim();

  if (trackerActivityId) {
    return createHash("md5")
      .update(`tracker:${trackerActivityId}`)
      .digest("hex");
  }

  const application =
    payload.application?.trim() || payload.appName?.trim() || "Unknown";

  const windowTitle = payload.windowTitle?.trim() || "";

  const startTime = payload.startTime || "";

  const stableIdentity = [application, windowTitle, startTime].join("|");

  return createHash("md5").update(stableIdentity).digest("hex");
}

function collectionUrl(): string {
  return [
    APPWRITE_ENDPOINT,
    "databases",
    APPWRITE_DATABASE_ID,
    "collections",
    APPWRITE_COLLECTION_ID,
    "documents",
  ].join("/");
}

function getAppwriteHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Appwrite-Project": APPWRITE_PROJECT || "",
    "X-Appwrite-Key": APPWRITE_API_KEY || "",
  };
}

function isConfigured(): boolean {
  return Boolean(
    APPWRITE_PROJECT &&
    APPWRITE_DATABASE_ID &&
    APPWRITE_COLLECTION_ID &&
    APPWRITE_API_KEY,
  );
}

function isDesktopAuthorized(request: NextRequest): boolean {
  const suppliedKey = request.headers.get("x-desktop-tracker-key");

  if (!DESKTOP_TRACKER_API_KEY) {
    return false;
  }

  return suppliedKey === DESKTOP_TRACKER_API_KEY;
}

async function getDocument(
  documentId: string,
): Promise<AppwriteDocument | null> {
  const response = await fetch(
    `${collectionUrl()}/${encodeURIComponent(documentId)}`,
    {
      method: "GET",
      headers: getAppwriteHeaders(),
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();

    throw new Error(`Appwrite GET failed (${response.status}): ${text}`);
  }

  return (await response.json()) as AppwriteDocument;
}

async function createDocument(
  documentId: string,
  data: Record<string, any>,
): Promise<Response> {
  return fetch(collectionUrl(), {
    method: "POST",
    headers: getAppwriteHeaders(),
    body: JSON.stringify({
      documentId,
      data,
    }),
    cache: "no-store",
  });
}

async function updateDocument(
  documentId: string,
  data: Record<string, any>,
): Promise<Response> {
  return fetch(`${collectionUrl()}/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    headers: getAppwriteHeaders(),
    body: JSON.stringify({
      data,
    }),
    cache: "no-store",
  });
}

/**
 * Merge automatic tracker data with an
 * existing Appwrite activity.
 *
 * Human decisions must win.
 *
 * If an activity was corrected or approved:
 * - preserve project
 * - preserve category
 * - preserve confidence
 * - preserve classification reason
 * - preserve status
 *
 * But keep updating:
 * - application
 * - window title
 * - start time
 * - end time
 * - duration
 */
function mergeWithExisting(
  existing: AppwriteDocument,
  incoming: NormalizedActivity,
): NormalizedActivity {
  const existingStatus = normalizeStatus(existing.status);

  const humanControlled =
    existingStatus === "corrected" || existingStatus === "approved";

  if (humanControlled) {
    return {
      ...incoming,

      project: existing.project ?? existing.projectName ?? incoming.project,

      projectName:
        existing.projectName ?? existing.project ?? incoming.projectName,

      projectId: existing.projectId ?? incoming.projectId,

      projectConfidence:
        existing.projectConfidence ?? incoming.projectConfidence,

      category:
        existing.category ?? existing.classification ?? incoming.category,

      classification:
        existing.classification ?? existing.category ?? incoming.classification,

      confidence: existing.confidence ?? incoming.confidence,

      classificationReason:
        existing.classificationReason ?? incoming.classificationReason,

      projectReason: existing.projectReason ?? incoming.projectReason,

      status: existingStatus,
    };
  }

  return {
    ...incoming,
    status: existingStatus === "pending" ? incoming.status : existingStatus,
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

/**
 * Converts a normalized activity into the exact
 * attribute set of the Appwrite "activities"
 * collection.
 *
 * Appwrite rejects documents containing unknown
 * attributes, so extra fields (for example
 * `classification` or `reasons`) must never be
 * sent. This filter is the reason cloud sync was
 * failing with "Unknown attribute" errors.
 *
 * String values are truncated to the collection's
 * configured maximum sizes.
 */
function toAppwriteData(activity: NormalizedActivity): Record<string, any> {
  return {
    application: truncate(activity.application, 255),
    appName: truncate(activity.appName, 255),
    windowTitle: truncate(activity.windowTitle, 500),

    startTime: truncate(activity.startTime, 100),
    endTime: truncate(activity.endTime, 100),
    duration: activity.duration,

    category: truncate(activity.category, 100),
    confidence: activity.confidence,

    project: truncate(activity.project, 100),
    projectName: truncate(activity.projectName, 255),
    projectId: truncate(activity.projectId, 255),
    projectConfidence: activity.projectConfidence,

    classificationReason: truncate(activity.classificationReason, 500),
    projectReason: truncate(activity.projectReason, 500),
    source: truncate(activity.source, 100),

    status: truncate(activity.status, 50),
  };
}

function jsonError(error: string, status: number, details?: string) {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

/**
 * POST /api/activities
 *
 * Used by the Electron desktop tracker.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isDesktopAuthorized(request)) {
      return jsonError("Unauthorized desktop tracker request.", 401);
    }

    if (!isConfigured()) {
      return jsonError("Appwrite server configuration is incomplete.", 500);
    }

    let payload: ActivityPayload;

    try {
      payload = (await request.json()) as ActivityPayload;
    } catch {
      return jsonError("Invalid JSON payload.", 400);
    }

    if (!payload || typeof payload !== "object") {
      return jsonError("Invalid activity payload.", 400);
    }

    const normalized = normalizeActivity(payload);

    if (!normalized.application) {
      return jsonError("Application name is required.", 400);
    }

    if (!Number.isFinite(normalized.duration)) {
      return jsonError("Duration must be a valid number.", 400);
    }

    if (normalized.confidence < 0 || normalized.confidence > 1) {
      return jsonError("Confidence must be between 0 and 1.", 400);
    }

    if (normalized.projectConfidence < 0 || normalized.projectConfidence > 1) {
      return jsonError("Project confidence must be between 0 and 1.", 400);
    }

    const documentId = generateActivityDocumentId(payload);

    let existing: AppwriteDocument | null = null;

    try {
      existing = await getDocument(documentId);
    } catch (error) {
      console.error("[Activity API] Failed to check existing document:", error);

      return jsonError(
        "Failed to check existing activity.",
        502,
        error instanceof Error ? error.message : String(error),
      );
    }

    /**
     * Existing activity:
     * update it rather than creating a duplicate.
     */
    if (existing) {
      const merged = mergeWithExisting(existing, normalized);

      const updateResponse = await updateDocument(
        documentId,
        toAppwriteData(merged),
      );

      if (!updateResponse.ok) {
        const text = await updateResponse.text();

        console.error(
          "[Activity API] Appwrite update failed:",
          updateResponse.status,
          text,
        );

        return jsonError("Failed to update activity.", 502, text);
      }

      const updatedDocument = (await updateResponse.json()) as AppwriteDocument;

      return NextResponse.json({
        success: true,
        action: "updated",
        updated: true,
        documentId,
        activityId: documentId,
        activity: updatedDocument,
      });
    }

    /**
     * First-time activity.
     */
    const createResponse = await createDocument(
      documentId,
      toAppwriteData(normalized),
    );

    if (createResponse.ok) {
      const createdDocument = (await createResponse.json()) as AppwriteDocument;

      return NextResponse.json(
        {
          success: true,
          action: "created",
          created: true,
          documentId,
          activityId: documentId,
          activity: createdDocument,
        },
        {
          status: 201,
        },
      );
    }

    /**
     * Race-condition protection.
     *
     * Two live-sync requests can arrive almost
     * simultaneously. If Appwrite says the document
     * already exists, retrieve and update it.
     */
    if (createResponse.status === 409) {
      try {
        const raceExisting = await getDocument(documentId);

        if (raceExisting) {
          const merged = mergeWithExisting(raceExisting, normalized);

          const updateResponse = await updateDocument(
            documentId,
            toAppwriteData(merged),
          );

          if (updateResponse.ok) {
            const updatedDocument =
              (await updateResponse.json()) as AppwriteDocument;

            return NextResponse.json({
              success: true,
              action: "updated-after-conflict",
              updated: true,
              documentId,
              activityId: documentId,
              activity: updatedDocument,
            });
          }
        }
      } catch (error) {
        console.error("[Activity API] Conflict recovery failed:", error);
      }
    }

    const errorText = await createResponse.text();

    console.error(
      "[Activity API] Appwrite create failed:",
      createResponse.status,
      errorText,
    );

    return jsonError("Failed to create activity.", 502, errorText);
  } catch (error) {
    console.error("[Activity API] Unexpected error:", error);

    return jsonError(
      "Internal server error.",
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * GET /api/activities
 *
 * Used as a simple health/configuration check
 * by the desktop tracker.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isDesktopAuthorized(request)) {
      return jsonError("Unauthorized.", 401);
    }

    const configured = isConfigured();

    return NextResponse.json({
      success: true,

      service: "smart-timesheet-activity-sync",

      configured,

      appwrite: {
        endpoint: APPWRITE_ENDPOINT,
        projectConfigured: Boolean(APPWRITE_PROJECT),
        databaseConfigured: Boolean(APPWRITE_DATABASE_ID),
        collectionConfigured: Boolean(APPWRITE_COLLECTION_ID),
        apiKeyConfigured: Boolean(APPWRITE_API_KEY),
      },

      features: {
        stableActivityIds: true,
        liveSync: true,
        correctionProtection: true,
        approvalProtection: true,
        duplicateProtection: true,
        conflictRecovery: true,
      },

      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Activity API] Health check failed:", error);

    return jsonError("Health check failed.", 500);
  }
}

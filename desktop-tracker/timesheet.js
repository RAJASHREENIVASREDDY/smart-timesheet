// =====================================================
// SMART TIMESHEET HELPERS
// =====================================================

/**
 * Safely convert a value into a valid Date.
 */
function toValidDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

// =====================================================
// CHECK WHETHER TWO DATES ARE ON THE SAME LOCAL DAY
// =====================================================

function isSameDay(dateA, dateB) {
  const a = toValidDate(dateA);
  const b = toValidDate(dateB);

  if (!a || !b) {
    return false;
  }

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// =====================================================
// GET REAL ACTIVITY DURATION
// =====================================================

function getActivityDuration(activity) {
  if (!activity) {
    return 0;
  }

  // ---------------------------------------------------
  // STORED DURATION
  // ---------------------------------------------------
  //
  // Completed activities normally contain a persisted
  // duration. Prefer that value because it represents
  // the tracker-calculated duration.
  //
  const storedDuration = Number(activity.duration);

  if (Number.isFinite(storedDuration) && storedDuration > 0) {
    return Math.max(0, Math.floor(storedDuration));
  }

  // ---------------------------------------------------
  // CALCULATE FROM START / END
  // ---------------------------------------------------
  //
  // This also supports the currently running activity.
  // When endTime doesn't exist, the current time is used.
  //

  const start = toValidDate(activity.startTime);

  if (!start) {
    return 0;
  }

  let end;

  if (activity.endTime) {
    end = toValidDate(activity.endTime);
  } else {
    end = new Date();
  }

  if (!end) {
    return 0;
  }

  const startMs = start.getTime();

  const endMs = end.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }

  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

// =====================================================
// NORMALIZE PROJECT NAME
// =====================================================

function getProjectName(activity) {
  if (
    activity &&
    typeof activity.projectName === "string" &&
    activity.projectName.trim()
  ) {
    return activity.projectName.trim();
  }

  return "Unassigned";
}

// =====================================================
// NORMALIZE CATEGORY
// =====================================================

function getCategory(activity) {
  if (
    activity &&
    typeof activity.category === "string" &&
    activity.category.trim()
  ) {
    return activity.category.trim();
  }

  return "Other";
}

// =====================================================
// GENERATE TIMESHEET
// =====================================================

function generateTimesheet(activities, filter = "today") {
  // ---------------------------------------------------
  // NORMALIZE INPUT
  // ---------------------------------------------------

  if (!Array.isArray(activities)) {
    activities = [];
  }

  // Only the supported filters are needed by the
  // desktop tracker UI.
  const normalizedFilter = filter === "all" ? "all" : "today";

  // ---------------------------------------------------
  // FILTER ACTIVITIES
  // ---------------------------------------------------

  let filteredActivities = activities;

  if (normalizedFilter === "today") {
    const today = new Date();

    filteredActivities = activities.filter((activity) => {
      if (!activity || !activity.startTime) {
        return false;
      }

      return isSameDay(activity.startTime, today);
    });
  }

  // ---------------------------------------------------
  // SUMMARY STORAGE
  // ---------------------------------------------------

  const projectMap = Object.create(null);

  const categoryMap = Object.create(null);

  let totalSeconds = 0;

  // ---------------------------------------------------
  // PROCESS ACTIVITIES
  // ---------------------------------------------------

  for (const activity of filteredActivities) {
    if (!activity) {
      continue;
    }

    const duration = getActivityDuration(activity);

    if (!Number.isFinite(duration) || duration <= 0) {
      continue;
    }

    totalSeconds += duration;

    // -----------------------------------------------
    // PROJECT
    // -----------------------------------------------

    const projectName = getProjectName(activity);

    if (!projectMap[projectName]) {
      projectMap[projectName] = {
        projectName,
        seconds: 0,
      };
    }

    projectMap[projectName].seconds += duration;

    // -----------------------------------------------
    // CATEGORY
    // -----------------------------------------------

    const category = getCategory(activity);

    if (!categoryMap[category]) {
      categoryMap[category] = {
        category,
        seconds: 0,
      };
    }

    categoryMap[category].seconds += duration;
  }

  // ---------------------------------------------------
  // PROJECT SUMMARY
  // ---------------------------------------------------

  const projects = Object.values(projectMap)
    .sort((a, b) => b.seconds - a.seconds)
    .map((project) => ({
      projectName: project.projectName,

      seconds: project.seconds,

      percentage:
        totalSeconds > 0
          ? Math.round((project.seconds / totalSeconds) * 100)
          : 0,
    }));

  // ---------------------------------------------------
  // CATEGORY SUMMARY
  // ---------------------------------------------------

  const categories = Object.values(categoryMap)
    .sort((a, b) => b.seconds - a.seconds)
    .map((category) => ({
      category: category.category,

      seconds: category.seconds,

      percentage:
        totalSeconds > 0
          ? Math.round((category.seconds / totalSeconds) * 100)
          : 0,
    }));

  // ---------------------------------------------------
  // RETURN TIMESHEET
  // ---------------------------------------------------

  return {
    filter: normalizedFilter,

    totalSeconds,

    activities: filteredActivities,

    projects,

    categories,
  };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  generateTimesheet,
  getActivityDuration,
  isSameDay,
};

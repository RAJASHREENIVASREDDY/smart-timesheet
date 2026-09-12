"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Client, Databases, Account, ID, Query } from "appwrite";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import toast, { Toaster } from "react-hot-toast";

type Activity = {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;

  activityId?: string;
  appName?: string;
  application?: string;
  windowTitle?: string;
  title?: string;

  startTime?: string;
  endTime?: string;
  duration?: number;

  category?: string;
  classification?: string;
  confidence?: number;
  classificationConfidence?: number;

  project?: string;
  projectName?: string;
  projectId?: string;
  projectConfidence?: number;

  classificationReason?: string;
  projectReason?: string;

  status?: string;
  source?: string;
};

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

const PROJECTS = ["Smart Timesheet", "TravelSync", "SkillSync", "Unassigned"];

const CATEGORIES = [
  "Development",
  "Design",
  "Communication",
  "Documentation",
  "Research",
  "Other",
];

export default function Home() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const [darkMode, setDarkMode] = useState(false);

  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dateRange, setDateRange] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");

  const [currentTime, setCurrentTime] = useState(new Date());

  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  const [editProject, setEditProject] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [approvedActivities, setApprovedActivities] = useState<string[]>([]);

  const [showOnlyReview, setShowOnlyReview] = useState(false);

  const client = useMemo(() => {
    return new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || "");
  }, []);

  const databases = useMemo(() => new Databases(client), [client]);
  const account = useMemo(() => new Account(client), [client]);

  const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || "";

  const COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_ID || "";

  /* =========================================================
     CLOCK
  ========================================================= */

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /* =========================================================
     HELPERS
  ========================================================= */

  const getAppName = (activity: Activity) => {
    return activity.appName || activity.application || "Unknown application";
  };

  const getWindowTitle = (activity: Activity) => {
    return activity.windowTitle || activity.title || "";
  };

  const normalizeCategory = (category?: string) => {
    if (!category) return "Other";

    const value = category.replace(/[^\w\s-]/g, "").trim();

    if (!value) return "Other";

    return value;
  };

  const getCategory = (activity: Activity) => {
    return normalizeCategory(activity.category || activity.classification);
  };

  const getProject = (activity: Activity) => {
    return activity.projectName || activity.project || "Unassigned";
  };

  const getConfidence = (activity: Activity) => {
    const value =
      activity.projectConfidence ??
      activity.classificationConfidence ??
      activity.confidence;

    if (typeof value !== "number") return null;

    return value <= 1 ? Math.round(value * 100) : Math.round(value);
  };

  const getDuration = (activity: Activity) => {
    if (typeof activity.duration === "number") {
      return Math.max(0, Math.round(activity.duration));
    }

    if (activity.startTime && activity.endTime) {
      const start = new Date(activity.startTime).getTime();
      const end = new Date(activity.endTime).getTime();

      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        return Math.max(0, Math.round((end - start) / 60000));
      }
    }

    return 0;
  };

  const getActivityDate = (activity: Activity) => {
    return (
      activity.startTime || activity.$createdAt || new Date().toISOString()
    );
  };

  const isReviewRequired = (activity: Activity) => {
    const confidence = getConfidence(activity);

    if (activity.status === "needs_review" || activity.status === "review") {
      return true;
    }

    if (confidence !== null && confidence < 70) {
      return true;
    }

    return (
      getProject(activity) === "Unassigned" || getCategory(activity) === "Other"
    );
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (mins === 0) return `${hours}h`;

    return `${hours}h ${mins}m`;
  };

  const cleanCategory = (category: string) => {
    return category.replace(/[^\w\s-]/g, "").trim();
  };

  /* =========================================================
     LOAD ACTIVITIES
  ========================================================= */

  const loadActivities = useCallback(
    async (silent = false) => {
      if (!DATABASE_ID || !COLLECTION_ID) {
        setLoading(false);
        return;
      }

      try {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTION_ID,
          [Query.orderDesc("$createdAt"), Query.limit(500)],
        );

        const docs = response.documents as unknown as Activity[];

        setActivities(docs);

        setApprovedActivities(
          docs
            .filter((activity) => activity.status === "approved")
            .map((activity) => activity.$id),
        );
      } catch (error: any) {
        console.error("Error loading activities:", error);

        if (!silent) {
          toast.error(
            "Could not load activities. Check Appwrite configuration.",
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [DATABASE_ID, COLLECTION_ID, databases],
  );

  /* =========================================================
     LOGIN CHECK
  ========================================================= */

  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await account.get();

        setUser(currentUser);
        setShowLogin(false);

        await loadActivities();
      } catch {
        setShowLogin(true);
        setLoading(false);
      }
    };

    checkUser();
  }, [account, loadActivities]);

  /* =========================================================
     AUTO REFRESH
  ========================================================= */

  useEffect(() => {
    if (showLogin) return;

    const interval = setInterval(() => {
      loadActivities(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [showLogin, loadActivities]);

  /* =========================================================
     KEYBOARD
  ========================================================= */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchTerm("");
      }

      if (event.ctrlKey && event.key.toLowerCase() === "r" && !showLogin) {
        event.preventDefault();
        loadActivities(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLogin, loadActivities]);

  /* =========================================================
     AUTH
  ========================================================= */

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      toast.error("Enter your email and password.");
      return;
    }

    try {
      setAuthLoading(true);

      await account.createEmailPasswordSession(email, password);

      const currentUser = await account.get();

      setUser(currentUser);
      setShowLogin(false);

      await loadActivities();

      toast.success("Login successful!");
    } catch (error: any) {
      toast.error(error?.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 8) {
      toast.error("Password must contain at least 8 characters.");
      return;
    }

    try {
      setAuthLoading(true);

      await account.create(ID.unique(), email, password, name);

      await account.createEmailPasswordSession(email, password);

      const currentUser = await account.get();

      setUser(currentUser);
      setShowLogin(false);

      await loadActivities();

      toast.success("Account created!");
    } catch (error: any) {
      toast.error(error?.message || "Signup failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await account.deleteSession("current");

      setUser(null);
      setActivities([]);
      setShowLogin(true);

      toast.success("Logged out.");
    } catch {
      toast.error("Logout failed.");
    }
  };

  /* =========================================================
     FILTERING
  ========================================================= */

  const filteredActivities = useMemo(() => {
    const now = new Date();

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    const search = searchTerm.trim().toLowerCase();

    return activities.filter((activity) => {
      const project = getProject(activity);
      const category = getCategory(activity);
      const appName = getAppName(activity);
      const title = getWindowTitle(activity);

      if (selectedProject !== "All" && project !== selectedProject) {
        return false;
      }

      if (selectedCategory !== "All" && category !== selectedCategory) {
        return false;
      }

      if (search) {
        const searchable = `
          ${appName}
          ${title}
          ${project}
          ${category}
        `.toLowerCase();

        if (!searchable.includes(search)) {
          return false;
        }
      }

      if (showOnlyReview && !isReviewRequired(activity)) {
        return false;
      }

      const date = new Date(getActivityDate(activity));

      if (dateRange === "today") {
        return date >= todayStart;
      }

      if (dateRange === "week") {
        return date >= weekStart;
      }

      if (dateRange === "month") {
        return date >= monthStart;
      }

      return true;
    });
  }, [
    activities,
    selectedProject,
    selectedCategory,
    dateRange,
    searchTerm,
    showOnlyReview,
  ]);

  /* =========================================================
     PROJECTS
  ========================================================= */

  const projects = useMemo(() => {
    const values = new Set<string>();

    activities.forEach((activity) => {
      values.add(getProject(activity));
    });

    PROJECTS.forEach((project) => values.add(project));

    return Array.from(values);
  }, [activities]);

  /* =========================================================
     STATS
  ========================================================= */

  const totalTime = useMemo(() => {
    return filteredActivities.reduce(
      (sum, activity) => sum + getDuration(activity),
      0,
    );
  }, [filteredActivities]);

  const totalActivities = filteredActivities.length;

  const reviewCount = useMemo(() => {
    return filteredActivities.filter(isReviewRequired).length;
  }, [filteredActivities]);

  const approvedCount = useMemo(() => {
    return filteredActivities.filter(
      (activity) =>
        activity.status === "approved" ||
        approvedActivities.includes(activity.$id),
    ).length;
  }, [filteredActivities, approvedActivities]);

  const projectCount = useMemo(() => {
    return new Set(filteredActivities.map(getProject)).size;
  }, [filteredActivities]);

  const weeklyStats = useMemo(() => {
    const now = new Date();

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekly = activities.filter(
      (activity) => new Date(getActivityDate(activity)) >= weekAgo,
    );

    return {
      total: weekly.reduce((sum, activity) => sum + getDuration(activity), 0),
      count: weekly.length,
    };
  }, [activities]);

  /* =========================================================
     CHART DATA
  ========================================================= */

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};

    filteredActivities.forEach((activity) => {
      const category = getCategory(activity);

      map[category] = (map[category] || 0) + getDuration(activity);
    });

    return Object.entries(map).map(([category, time]) => ({
      category: cleanCategory(category),
      full: category,
      time,
    }));
  }, [filteredActivities]);

  const pieData = useMemo(() => {
    return categoryData.map((item) => ({
      name: item.full,
      value: item.time,
    }));
  }, [categoryData]);

  const projectData = useMemo(() => {
    const map: Record<string, number> = {};

    filteredActivities.forEach((activity) => {
      const project = getProject(activity);

      map[project] = (map[project] || 0) + getDuration(activity);
    });

    return Object.entries(map)
      .map(([name, time]) => ({
        name,
        time,
      }))
      .sort((a, b) => b.time - a.time);
  }, [filteredActivities]);

  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};

    filteredActivities.forEach((activity) => {
      const date = new Date(getActivityDate(activity));

      const label = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

      map[label] = (map[label] || 0) + getDuration(activity);
    });

    return Object.entries(map).map(([date, time]) => ({
      date,
      time,
    }));
  }, [filteredActivities]);

  /* =========================================================
     APPROVE
  ========================================================= */

  const approveActivity = async (id: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
        status: "approved",
      });

      setApprovedActivities((previous) =>
        previous.includes(id) ? previous : [...previous, id],
      );

      setActivities((previous) =>
        previous.map((activity) =>
          activity.$id === id
            ? {
                ...activity,
                status: "approved",
              }
            : activity,
        ),
      );

      toast.success("Activity approved.");
    } catch (error: any) {
      toast.error(error?.message || "Could not approve activity.");
    }
  };

  /* =========================================================
     EDIT ACTIVITY
  ========================================================= */

  const openEditor = (activity: Activity) => {
    setEditingActivity(activity);
    setEditProject(getProject(activity));
    setEditCategory(getCategory(activity));
  };

  const closeEditor = () => {
    if (savingEdit) return;

    setEditingActivity(null);
    setEditProject("");
    setEditCategory("");
  };

  const saveActivityCorrection = async () => {
    if (!editingActivity) return;

    if (!editProject || !editCategory) {
      toast.error("Select both project and category.");
      return;
    }

    try {
      setSavingEdit(true);

      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_ID,
        editingActivity.$id,
        {
          project: editProject,
          projectName: editProject,
          category: editCategory,
          status: "corrected",
        },
      );

      setActivities((previous) =>
        previous.map((activity) =>
          activity.$id === editingActivity.$id
            ? {
                ...activity,
                project: editProject,
                projectName: editProject,
                category: editCategory,
                status: "corrected",
              }
            : activity,
        ),
      );

      toast.success("Correction saved.");

      closeEditor();
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Could not save correction. Check your Appwrite attributes.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  /* =========================================================
     CLEAR DATA
  ========================================================= */

  const clearActivities = async () => {
    if (activities.length === 0) {
      toast("There are no activities to clear.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${activities.length} activities? This cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      setLoading(true);

      for (const activity of activities) {
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTION_ID,
          activity.$id,
        );
      }

      setActivities([]);
      setApprovedActivities([]);

      toast.success("All activities cleared.");
    } catch (error: any) {
      toast.error(error?.message || "Could not clear activities.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     CSV EXPORT
  ========================================================= */

  const exportCSV = () => {
    if (filteredActivities.length === 0) {
      toast.error("No activities to export.");
      return;
    }

    const headers = [
      "Sl No",
      "Application",
      "Window Title",
      "Duration (mins)",
      "Category",
      "Project",
      "Confidence",
      "Status",
      "Date",
    ];

    const escapeCSV = (value: any) => {
      const text = String(value ?? "");

      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }

      return text;
    };

    const rows = filteredActivities.map((activity, index) => [
      index + 1,
      getAppName(activity),
      getWindowTitle(activity),
      getDuration(activity),
      getCategory(activity),
      getProject(activity),
      getConfidence(activity) === null ? "" : `${getConfidence(activity)}%`,
      activity.status || "pending",
      new Date(getActivityDate(activity)).toLocaleString(),
    ]);

    let csv = "\uFEFF";

    csv += headers.map(escapeCSV).join(",") + "\n";

    rows.forEach((row) => {
      csv += row.map(escapeCSV).join(",") + "\n";
    });

    csv += "\nSUMMARY\n";
    csv += `Total Time,${totalTime} mins\n`;
    csv += `Total Activities,${totalActivities}\n`;
    csv += `Projects,${projectCount}\n`;
    csv += `Needs Review,${reviewCount}\n`;
    csv += `Approved,${approvedCount}\n`;

    csv += "\nCATEGORY BREAKDOWN\n";
    csv += "Category,Minutes,Percentage\n";

    categoryData.forEach((item) => {
      const percentage =
        totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;

      csv += `${escapeCSV(item.full)},${item.time},${percentage}%\n`;
    });

    csv += "\nPROJECT BREAKDOWN\n";
    csv += "Project,Minutes,Percentage\n";

    projectData.forEach((item) => {
      const percentage =
        totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;

      csv += `${escapeCSV(item.name)},${item.time},${percentage}%\n`;
    });

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `smart-timesheet-${
      new Date().toISOString().split("T")[0]
    }.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);

    toast.success("CSV exported.");
  };

  /* =========================================================
     EXCEL EXPORT
  ========================================================= */

  const exportExcel = () => {
    if (filteredActivities.length === 0) {
      toast.error("No activities to export.");
      return;
    }

    const activityRows = filteredActivities.map((activity, index) => ({
      "Sl No": index + 1,
      Application: getAppName(activity),
      "Window Title": getWindowTitle(activity),
      "Duration (mins)": getDuration(activity),
      Category: getCategory(activity),
      Project: getProject(activity),
      Confidence:
        getConfidence(activity) === null ? "" : `${getConfidence(activity)}%`,
      Status: activity.status || "pending",
      Date: new Date(getActivityDate(activity)).toLocaleString(),
    }));

    const workbook = XLSX.utils.book_new();

    const activitySheet = XLSX.utils.json_to_sheet(activityRows);

    XLSX.utils.book_append_sheet(workbook, activitySheet, "Activities");

    const summaryRows: any[][] = [
      ["SMART TIMESHEET REPORT"],
      [],
      ["Metric", "Value"],
      ["Total Time", formatDuration(totalTime)],
      ["Total Activities", totalActivities],
      ["Projects", projectCount],
      ["Needs Review", reviewCount],
      ["Approved", approvedCount],
      [],
      ["CATEGORY BREAKDOWN"],
      ["Category", "Minutes", "Percentage"],
    ];

    categoryData.forEach((item) => {
      const percentage =
        totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;

      summaryRows.push([item.full, item.time, `${percentage}%`]);
    });

    summaryRows.push(
      [],
      ["PROJECT BREAKDOWN"],
      ["Project", "Minutes", "Percentage"],
    );

    projectData.forEach((item) => {
      const percentage =
        totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;

      summaryRows.push([item.name, item.time, `${percentage}%`]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    XLSX.writeFile(
      workbook,
      `smart-timesheet-${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    toast.success("Excel exported.");
  };

  /* =========================================================
     PDF EXPORT
  ========================================================= */

  const exportPDF = () => {
    if (filteredActivities.length === 0) {
      toast.error("No activities to export.");
      return;
    }

    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.setTextColor(25, 25, 25);

    doc.text("Smart Timesheet Report", 20, 22);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);

    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);

    doc.text(`User: ${user?.name || user?.email || "User"}`, 20, 36);

    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);

    doc.text("Summary", 20, 50);

    doc.setFontSize(10);

    doc.text(`Total time: ${formatDuration(totalTime)}`, 20, 59);

    doc.text(`Activities: ${totalActivities}`, 20, 66);

    doc.text(`Projects: ${projectCount}`, 20, 73);

    doc.text(`Needs review: ${reviewCount}`, 20, 80);

    doc.text(`Approved: ${approvedCount}`, 20, 87);

    doc.setFontSize(12);

    doc.text("Activity Details", 20, 102);

    let y = 112;

    filteredActivities.forEach((activity, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const app = getAppName(activity);
      const category = cleanCategory(getCategory(activity));
      const project = getProject(activity);
      const duration = getDuration(activity);

      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);

      doc.text(`${index + 1}. ${app} — ${duration} mins`, 20, y);

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);

      doc.text(`${category} | ${project}`, 20, y + 5);

      y += 12;
    });

    doc.addPage();

    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);

    doc.text("Category Summary", 20, 25);

    let categoryY = 38;

    categoryData.forEach((item) => {
      const percentage =
        totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;

      doc.setFontSize(10);

      doc.text(
        `${cleanCategory(item.full)}: ${item.time} mins (${percentage}%)`,
        20,
        categoryY,
      );

      categoryY += 10;
    });

    doc.setFontSize(16);

    doc.text("Project Summary", 20, categoryY + 15);

    categoryY += 28;

    projectData.forEach((item) => {
      const percentage =
        totalTime > 0 ? Math.round((item.time / totalTime) * 100) : 0;

      doc.setFontSize(10);

      doc.text(
        `${item.name}: ${item.time} mins (${percentage}%)`,
        20,
        categoryY,
      );

      categoryY += 10;
    });

    const pageCount = doc.internal.pages.length - 1;

    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);

      doc.text(`Page ${page} of ${pageCount}`, 170, 285);

      doc.text("Smart Timesheet", 20, 285);
    }

    doc.save("smart-timesheet-report.pdf");

    toast.success("PDF exported.");
  };

  /* =========================================================
     LOGIN SCREEN
  ========================================================= */

  if (showLogin) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-6 ${
          darkMode ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <Toaster position="top-right" />

        <div
          className={`w-full max-w-md rounded-2xl shadow-xl p-8 ${
            darkMode ? "bg-gray-900 border border-gray-800" : "bg-white"
          }`}
        >
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">⏱️</div>

            <h1 className="text-3xl font-bold">Smart Timesheet</h1>

            <p
              className={`mt-2 text-sm ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              Automatic work intelligence
            </p>
          </div>

          <form
            onSubmit={isLogin ? handleLogin : handleSignup}
            className="space-y-4"
          >
            {!isLogin && (
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className={`w-full rounded-xl border p-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode
                    ? "bg-gray-800 border-gray-700 text-white"
                    : "bg-white border-gray-300"
                }`}
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className={`w-full rounded-xl border p-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode
                  ? "bg-gray-800 border-gray-700 text-white"
                  : "bg-white border-gray-300"
              }`}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className={`w-full rounded-xl border p-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode
                  ? "bg-gray-800 border-gray-700 text-white"
                  : "bg-white border-gray-300"
              }`}
            />

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 transition"
            >
              {authLoading
                ? "Please wait..."
                : isLogin
                  ? "Login"
                  : "Create Account"}
            </button>
          </form>

          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full mt-5 text-sm text-blue-500 hover:underline"
          >
            {isLogin
              ? "Create a new account"
              : "Already have an account? Login"}
          </button>

          <div className="flex justify-center mt-6">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-4 py-2 rounded-lg text-sm ${
                darkMode ? "bg-gray-800" : "bg-gray-100"
              }`}
            >
              {darkMode ? "☀️ Light mode" : "🌙 Dark mode"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     DASHBOARD
  ========================================================= */

  return (
    <div
      className={`min-h-screen ${
        darkMode ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"
      }`}
    >
      <Toaster position="top-right" />

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* HEADER */}

        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-3xl">⏱️</div>

              <div>
                <h1 className="text-3xl font-bold">Smart Timesheet</h1>

                <p
                  className={`text-sm ${
                    darkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  Work Intelligence Dashboard
                </p>
              </div>
            </div>

            <div
              className={`mt-2 text-sm ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {user?.name || user?.email || "User"} •{" "}
              {currentTime.toLocaleTimeString()}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => loadActivities(true)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                darkMode
                  ? "bg-gray-800 hover:bg-gray-700"
                  : "bg-white hover:bg-gray-100 border"
              }`}
            >
              {refreshing ? "↻ Refreshing..." : "↻ Refresh"}
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-4 py-2 rounded-xl text-sm ${
                darkMode ? "bg-gray-800" : "bg-white border"
              }`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              onClick={exportCSV}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
            >
              CSV
            </button>

            <button
              onClick={exportExcel}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
            >
              Excel
            </button>

            <button
              onClick={exportPDF}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm"
            >
              PDF
            </button>

            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-gray-600 hover:bg-gray-700 text-white text-sm"
            >
              Logout
            </button>
          </div>
        </header>

        {/* LIVE STATUS */}

        <div
          className={`rounded-2xl p-4 mb-6 border ${
            darkMode
              ? "bg-gray-900 border-gray-800"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>

              <div>
                <p className="font-semibold">Desktop tracking connected</p>

                <p
                  className={`text-xs ${
                    darkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  Activities refresh automatically every 10 seconds.
                </p>
              </div>
            </div>

            <div
              className={`text-xs px-3 py-2 rounded-lg ${
                darkMode
                  ? "bg-gray-800 text-gray-300"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Ctrl + R = Refresh
            </div>
          </div>
        </div>

        {/* FILTERS */}

        <section
          className={`rounded-2xl p-4 mb-6 shadow-sm ${
            darkMode
              ? "bg-gray-900 border border-gray-800"
              : "bg-white border border-gray-200"
          }`}
        >
          <div className="flex flex-col lg:flex-row gap-3">
            <select
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              className={`rounded-xl border p-3 ${
                darkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-300"
              }`}
            >
              <option value="All">All Projects</option>

              {projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className={`rounded-xl border p-3 ${
                darkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-300"
              }`}
            >
              <option value="All">All Categories</option>

              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value)}
              className={`rounded-xl border p-3 ${
                darkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-300"
              }`}
            >
              <option value="today">Today</option>

              <option value="week">Last 7 Days</option>

              <option value="month">Last 30 Days</option>

              <option value="all">All Time</option>
            </select>

            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search app, title, project..."
              className={`flex-1 rounded-xl border p-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-300"
              }`}
            />

            <button
              onClick={() => setShowOnlyReview(!showOnlyReview)}
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                showOnlyReview
                  ? "bg-amber-500 text-white"
                  : darkMode
                    ? "bg-gray-800"
                    : "bg-gray-100"
              }`}
            >
              ⚠️ Review {reviewCount > 0 && `(${reviewCount})`}
            </button>
          </div>
        </section>

        {/* STATS */}

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div
            className={`rounded-2xl p-5 shadow-sm ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <p className="text-sm opacity-60">Total Time</p>

            <p className="text-2xl font-bold text-blue-500 mt-1">
              {formatDuration(totalTime)}
            </p>

            <p className="text-xs opacity-50 mt-1">Current filter</p>
          </div>

          <div
            className={`rounded-2xl p-5 shadow-sm ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <p className="text-sm opacity-60">Activities</p>

            <p className="text-2xl font-bold text-green-500 mt-1">
              {totalActivities}
            </p>

            <p className="text-xs opacity-50 mt-1">Detected sessions</p>
          </div>

          <div
            className={`rounded-2xl p-5 shadow-sm ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <p className="text-sm opacity-60">Projects</p>

            <p className="text-2xl font-bold text-purple-500 mt-1">
              {projectCount}
            </p>

            <p className="text-xs opacity-50 mt-1">Associated projects</p>
          </div>

          <div
            className={`rounded-2xl p-5 shadow-sm ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <p className="text-sm opacity-60">Needs Review</p>

            <p className="text-2xl font-bold text-amber-500 mt-1">
              {reviewCount}
            </p>

            <p className="text-xs opacity-50 mt-1">
              Low confidence / unassigned
            </p>
          </div>

          <div
            className={`rounded-2xl p-5 shadow-sm ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <p className="text-sm opacity-60">This Week</p>

            <p className="text-2xl font-bold text-orange-500 mt-1">
              {formatDuration(weeklyStats.total)}
            </p>

            <p className="text-xs opacity-50 mt-1">
              {weeklyStats.count} activities
            </p>
          </div>
        </section>

        {/* ANALYTICS */}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div
            className={`rounded-2xl p-5 ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <h2 className="text-lg font-bold mb-4">Time by Category</h2>

            {categoryData.length === 0 ? (
              <div className="h-64 flex items-center justify-center opacity-50">
                No category data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={categoryData}>
                  <XAxis
                    dataKey="category"
                    stroke={darkMode ? "#9ca3af" : "#6b7280"}
                  />

                  <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} />

                  <Tooltip />

                  <Bar dataKey="time" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div
            className={`rounded-2xl p-5 ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <h2 className="text-lg font-bold mb-4">Category Distribution</h2>

            {pieData.length === 0 ? (
              <div className="h-64 flex items-center justify-center opacity-50">
                No category data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) =>
                      `${name} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>

                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* DAILY TREND */}

        {dailyData.length > 1 && (
          <section
            className={`rounded-2xl p-5 mb-6 ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <h2 className="text-lg font-bold mb-4">Daily Activity Trend</h2>

            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyData}>
                <XAxis
                  dataKey="date"
                  stroke={darkMode ? "#9ca3af" : "#6b7280"}
                />

                <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="time"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}

        {/* PROJECT DISTRIBUTION */}

        {projectData.length > 0 && (
          <section
            className={`rounded-2xl p-5 mb-6 ${
              darkMode
                ? "bg-gray-900 border border-gray-800"
                : "bg-white border border-gray-200"
            }`}
          >
            <h2 className="text-lg font-bold mb-5">
              Project Time Distribution
            </h2>

            <div className="space-y-4">
              {projectData.map((project, index) => {
                const percentage =
                  totalTime > 0
                    ? Math.round((project.time / totalTime) * 100)
                    : 0;

                return (
                  <div key={project.name}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">{project.name}</span>

                      <span className="opacity-70">
                        {formatDuration(project.time)} ({percentage}%)
                      </span>
                    </div>

                    <div
                      className={`w-full h-2 rounded-full ${
                        darkMode ? "bg-gray-800" : "bg-gray-200"
                      }`}
                    >
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ACTIVITY FEED */}

        <section
          className={`rounded-2xl shadow-sm ${
            darkMode
              ? "bg-gray-900 border border-gray-800"
              : "bg-white border border-gray-200"
          }`}
        >
          <div className="p-5 border-b border-gray-200 dark:border-gray-800">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">Activity Intelligence</h2>

                <p
                  className={`text-sm mt-1 ${
                    darkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  Automatically captured desktop work
                </p>
              </div>

              <div className="text-sm opacity-60">
                {filteredActivities.length} shown
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center opacity-60">
              Loading activities...
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">🖥️</div>

              <h3 className="font-semibold text-lg">No activities found</h3>

              <p className="text-sm opacity-60 mt-2">
                Start the desktop tracker and use your computer. Detected work
                will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {filteredActivities.map((activity) => {
                const review = isReviewRequired(activity);

                const approved =
                  activity.status === "approved" ||
                  approvedActivities.includes(activity.$id);

                const confidence = getConfidence(activity);

                return (
                  <div
                    key={activity.$id}
                    className={`p-5 transition ${
                      darkMode ? "hover:bg-gray-800/60" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* APP */}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                              darkMode ? "bg-gray-800" : "bg-gray-100"
                            }`}
                          >
                            🖥️
                          </div>

                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">
                              {getAppName(activity)}
                            </h3>

                            {getWindowTitle(activity) && (
                              <p
                                className={`text-sm truncate ${
                                  darkMode ? "text-gray-400" : "text-gray-500"
                                }`}
                              >
                                {getWindowTitle(activity)}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2 mt-2">
                              <span className="px-2 py-1 rounded-md text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {getCategory(activity)}
                              </span>

                              <span className="px-2 py-1 rounded-md text-xs bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                📁 {getProject(activity)}
                              </span>

                              <span className="px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                ⏱️ {formatDuration(getDuration(activity))}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* INTELLIGENCE */}

                      <div className="lg:w-56">
                        {review ? (
                          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                              ⚠️ Needs review
                            </p>

                            <p className="text-xs opacity-60 mt-1">
                              {confidence !== null
                                ? `Confidence ${confidence}%`
                                : "Low-confidence classification"}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3">
                            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                              ✓ Automatically classified
                            </p>

                            {confidence !== null && (
                              <p className="text-xs opacity-60 mt-1">
                                Confidence {confidence}%
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ACTIONS */}

                      <div className="flex flex-wrap gap-2 lg:w-48 lg:justify-end">
                        <button
                          onClick={() => openEditor(activity)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium ${
                            darkMode
                              ? "bg-gray-800 hover:bg-gray-700"
                              : "bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          ✏️ Correct
                        </button>

                        {approved ? (
                          <span className="px-3 py-2 rounded-lg bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs font-semibold">
                            ✓ Approved
                          </span>
                        ) : (
                          <button
                            onClick={() => approveActivity(activity.$id)}
                            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </div>

                    {/* DETAILS */}

                    <div className="mt-4 ml-0 lg:ml-14 flex flex-wrap gap-x-5 gap-y-1 text-xs opacity-50">
                      <span>
                        Started:{" "}
                        {new Date(getActivityDate(activity)).toLocaleString()}
                      </span>

                      {activity.source && (
                        <span>Source: {activity.source}</span>
                      )}

                      {activity.classificationReason && (
                        <span>
                          Classification: {activity.classificationReason}
                        </span>
                      )}

                      {activity.projectReason && (
                        <span>Project: {activity.projectReason}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* FOOTER */}

        <footer
          className={`mt-6 rounded-2xl p-5 text-sm ${
            darkMode
              ? "bg-gray-900 border border-gray-800 text-gray-400"
              : "bg-blue-50 border border-blue-100 text-blue-800"
          }`}
        >
          <div className="font-semibold mb-2">🧠 Work Intelligence</div>

          <p>
            Smart Timesheet captures desktop activity, classifies work,
            associates it with projects, highlights uncertain decisions, and
            lets the user correct and approve the generated timesheet.
          </p>

          <p className="mt-2 opacity-70">
            Dashboard automatically refreshes every 10 seconds.
          </p>
        </footer>
      </div>

      {/* =====================================================
          CORRECTION MODAL
      ===================================================== */}

      {editingActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeEditor} />

          <div
            className={`relative w-full max-w-lg rounded-2xl shadow-2xl p-6 ${
              darkMode
                ? "bg-gray-900 text-white border border-gray-800"
                : "bg-white text-gray-900"
            }`}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold">Correct Activity</h2>

                <p className="text-sm opacity-60 mt-1">
                  Teach the timesheet the correct project/category.
                </p>
              </div>

              <button
                onClick={closeEditor}
                className="text-xl opacity-50 hover:opacity-100"
              >
                ×
              </button>
            </div>

            <div
              className={`rounded-xl p-4 mb-5 ${
                darkMode ? "bg-gray-800" : "bg-gray-100"
              }`}
            >
              <p className="font-semibold">{getAppName(editingActivity)}</p>

              {getWindowTitle(editingActivity) && (
                <p className="text-sm opacity-60 mt-1">
                  {getWindowTitle(editingActivity)}
                </p>
              )}

              <p className="text-xs opacity-50 mt-2">
                {formatDuration(getDuration(editingActivity))}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Project
                </label>

                <select
                  value={editProject}
                  onChange={(event) => setEditProject(event.target.value)}
                  className={`w-full rounded-xl border p-3 ${
                    darkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-300"
                  }`}
                >
                  {Array.from(new Set([...PROJECTS, ...projects, editProject]))
                    .filter(Boolean)
                    .map((project) => (
                      <option key={project} value={project}>
                        {project}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Category
                </label>

                <select
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value)}
                  className={`w-full rounded-xl border p-3 ${
                    darkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-300"
                  }`}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeEditor}
                disabled={savingEdit}
                className={`flex-1 rounded-xl py-3 font-medium ${
                  darkMode
                    ? "bg-gray-800 hover:bg-gray-700"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                Cancel
              </button>

              <button
                onClick={saveActivityCorrection}
                disabled={savingEdit}
                className="flex-1 rounded-xl py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Correction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

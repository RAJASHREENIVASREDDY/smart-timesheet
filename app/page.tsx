"use client";

import { useEffect, useState } from "react";
import { Client, Databases, Account, ID } from "appwrite";
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

export default function Home() {
  // ========== STATE ==========
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedProject, setSelectedProject] = useState("All");
  const [dateRange, setDateRange] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isTracking, setIsTracking] = useState(false);
  const [trackingStart, setTrackingStart] = useState<Date | null>(null);
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [approvedActivities, setApprovedActivities] = useState<string[]>([]);

  // ========== APPWRITE SETUP ==========
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!);

  const databases = new Databases(client);
  const account = new Account(client);

  const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
  const COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_ID!;

  // ========== LIVE CLOCK ==========
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ========== KEYBOARD SHORTCUTS ==========
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        if (!showLogin) addSampleActivity();
      }
      if (e.key === "Escape") {
        // Clear search on Escape
        setSearchTerm("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLogin]);

  // ========== CHECK LOGIN STATUS ==========
  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
        setShowLogin(false);
        loadActivities();
      } catch (error) {
        setShowLogin(true);
        setLoading(false);
      }
    };
    checkUser();
  }, []);

  // ========== LOAD ACTIVITIES ==========
  const loadActivities = async () => {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
      );
      setActivities(response.documents);
      // Load approved statuses
      const approved = response.documents
        .filter((d) => d.status === "approved")
        .map((d) => d.$id);
      setApprovedActivities(approved);
      setLoading(false);
    } catch (error: any) {
      console.error("Error loading activities:", error);
      setLoading(false);
    }
  };

  // ========== LOGIN ==========
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await account.createEmailPasswordSession(email, password);
      const currentUser = await account.get();
      setUser(currentUser);
      setShowLogin(false);
      loadActivities();
      toast.success("✅ Login successful!");
    } catch (error: any) {
      toast.error("❌ Login failed: " + error.message);
    }
  };

  // ========== SIGNUP ==========
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await account.create(ID.unique(), email, password, name);
      await account.createEmailPasswordSession(email, password);
      const currentUser = await account.get();
      setUser(currentUser);
      setShowLogin(false);
      loadActivities();
      toast.success("✅ Signup successful!");
    } catch (error: any) {
      toast.error("❌ Signup failed: " + error.message);
    }
  };

  // ========== DEMO ACCOUNT ==========
  const handleDemoLogin = () => {
    setEmail("demo@demo.com");
    setPassword("demodemo");
    toast.success("🔄 Demo credentials loaded! Click Login.");
  };

  // ========== LOGOUT ==========
  const handleLogout = async () => {
    try {
      await account.deleteSession("current");
      setUser(null);
      setShowLogin(true);
      setActivities([]);
      toast.success("Logged out");
    } catch (error) {
      toast.error("Logout failed");
    }
  };

  // ========== ADD SAMPLE DATA ==========
  const addSampleActivity = async () => {
    try {
      const sampleData = [
        {
          appName: "AutoCAD",
          duration: 120,
          category: "Design",
          project: "Project Alpha",
        },
        {
          appName: "Figma",
          duration: 60,
          category: "Design",
          project: "Project Beta",
        },
        {
          appName: "Gmail",
          duration: 30,
          category: "Communication",
          project: "Project Alpha",
        },
        {
          appName: "Excel",
          duration: 45,
          category: "Documentation",
          project: "Project Gamma",
        },
        {
          appName: "Chrome",
          duration: 90,
          category: "Research",
          project: "Project Beta",
        },
        {
          appName: "VSCode",
          duration: 75,
          category: "Development",
          project: "Project Alpha",
        },
        {
          appName: "Slack",
          duration: 25,
          category: "Communication",
          project: "Project Gamma",
        },
        {
          appName: "Photoshop",
          duration: 50,
          category: "Design",
          project: "Project Beta",
        },
      ];

      for (const item of sampleData) {
        await databases.createDocument(
          DATABASE_ID,
          COLLECTION_ID,
          ID.unique(),
          item,
        );
      }
      toast.success("✅ Sample activities added!");
      loadActivities();
    } catch (error: any) {
      toast.error("❌ Error adding sample data: " + error.message);
    }
  };

  // ========== MANUAL ACTIVITY (from timer) ==========
  const addManualActivity = async (
    appName: string,
    duration: number,
    category: string,
    project: string,
  ) => {
    try {
      await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
        appName,
        duration,
        category,
        project,
      });
      toast.success("✅ Activity tracked: " + appName);
      loadActivities();
    } catch (error: any) {
      toast.error("❌ Error saving activity: " + error.message);
    }
  };

  // ========== START/STOP TRACKING ==========
  const toggleTracking = () => {
    if (!isTracking) {
      setIsTracking(true);
      setTrackingStart(new Date());
      setTrackedSeconds(0);
      toast.success("▶️ Tracking started!");
    } else {
      setIsTracking(false);
      if (trackingStart) {
        const duration = Math.round(
          (new Date().getTime() - trackingStart.getTime()) / 60000,
        );
        if (duration > 0) {
          addManualActivity("Manual Task", duration, "Other", "Project Alpha");
        } else {
          toast.error("⏱️ Track at least 1 minute");
        }
      }
      setTrackingStart(null);
    }
  };

  // ========== CLEAR ALL DATA ==========
  const clearActivities = async () => {
    if (!confirm("Delete all activities?")) return;
    try {
      for (const activity of activities) {
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTION_ID,
          activity.$id,
        );
      }
      toast.success("✅ All activities cleared!");
      loadActivities();
    } catch (error: any) {
      toast.error("❌ Error clearing data: " + error.message);
    }
  };

  // ========== APPROVE ACTIVITY ==========
  const approveActivity = async (id: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
        status: "approved",
      });
      setApprovedActivities([...approvedActivities, id]);
      toast.success("✅ Activity approved!");
      loadActivities();
    } catch (error: any) {
      toast.error("❌ Error approving: " + error.message);
    }
  };

  // ========== AI CLASSIFICATION ==========
  const classifyActivity = (appName: string) => {
    const appNameLower = appName?.toLowerCase() || "";

    if (
      [
        "autocad",
        "figma",
        "sketchup",
        "revit",
        "blender",
        "photoshop",
        "illustrator",
        "3ds max",
        "lumion",
      ].some((kw) => appNameLower.includes(kw))
    ) {
      return "🎨 Design";
    }
    if (
      [
        "vscode",
        "vs code",
        "github",
        "git",
        "terminal",
        "cursor",
        "intellij",
        "pycharm",
        "webstorm",
      ].some((kw) => appNameLower.includes(kw))
    ) {
      return "💻 Development";
    }
    if (
      [
        "gmail",
        "outlook",
        "slack",
        "whatsapp",
        "teams",
        "zoom",
        "meet",
        "discord",
        "telegram",
      ].some((kw) => appNameLower.includes(kw))
    ) {
      return "📧 Communication";
    }
    if (
      [
        "word",
        "excel",
        "powerpoint",
        "docs",
        "sheets",
        "slides",
        "notion",
        "evernote",
        "one note",
      ].some((kw) => appNameLower.includes(kw))
    ) {
      return "📊 Documentation";
    }
    if (
      [
        "chrome",
        "firefox",
        "safari",
        "edge",
        "browser",
        "research",
        "stack overflow",
        "google",
      ].some((kw) => appNameLower.includes(kw))
    ) {
      return "🔍 Research";
    }
    return "📌 Other";
  };

  // ========== FILTER ACTIVITIES ==========
  const getFilteredActivities = () => {
    let filtered = activities;

    if (selectedProject !== "All") {
      filtered = filtered.filter((a) => a.project === selectedProject);
    }

    if (searchTerm) {
      filtered = filtered.filter((a) =>
        a.appName?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateRange === "today") {
      const todayStr = today.toISOString().split("T")[0];
      filtered = filtered.filter(
        (a) => a.$createdAt?.split("T")[0] === todayStr,
      );
    } else if (dateRange === "week") {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter((a) => new Date(a.$createdAt) >= weekAgo);
    } else if (dateRange === "month") {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      filtered = filtered.filter((a) => new Date(a.$createdAt) >= monthAgo);
    }

    return filtered;
  };

  const filteredActivities = getFilteredActivities();

  // ========== CALCULATIONS ==========
  const totalTime = filteredActivities.reduce(
    (sum, act) => sum + (act.duration || 0),
    0,
  );
  const projects = [
    ...new Set(activities.map((a) => a.project).filter(Boolean)),
  ];

  // ========== WEEKLY STATS ==========
  const getWeeklyStats = () => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekly = activities.filter((a) => new Date(a.$createdAt) >= weekAgo);
    return {
      total: weekly.reduce((sum, a) => sum + (a.duration || 0), 0),
      count: weekly.length,
    };
  };
  const weeklyStats = getWeeklyStats();

  // ========== CHART DATA ==========
  const getChartData = () => {
    const categoryCount: Record<string, number> = {};
    filteredActivities.forEach((act) => {
      const cat = classifyActivity(act.appName);
      categoryCount[cat] = (categoryCount[cat] || 0) + (act.duration || 0);
    });
    return Object.keys(categoryCount).map((key) => ({
      category: key.replace(/[^\w\s]/g, "").trim(),
      time: categoryCount[key],
      full: key,
    }));
  };

  const getPieData = () => {
    const categoryCount: Record<string, number> = {};
    filteredActivities.forEach((act) => {
      const cat = classifyActivity(act.appName);
      categoryCount[cat] = (categoryCount[cat] || 0) + (act.duration || 0);
    });
    return Object.keys(categoryCount).map((key) => ({
      name: key,
      value: categoryCount[key],
    }));
  };

  const getProjectData = () => {
    const projectCount: Record<string, number> = {};
    filteredActivities.forEach((act) => {
      if (act.project) {
        projectCount[act.project] =
          (projectCount[act.project] || 0) + (act.duration || 0);
      }
    });
    return Object.keys(projectCount).map((key) => ({
      name: key,
      time: projectCount[key],
    }));
  };

  const getDailyData = () => {
    const dailyMap: Record<string, number> = {};
    filteredActivities.forEach((act) => {
      const date = new Date(act.$createdAt).toLocaleDateString();
      dailyMap[date] = (dailyMap[date] || 0) + (act.duration || 0);
    });
    return Object.keys(dailyMap).map((date) => ({
      date,
      time: dailyMap[date],
    }));
  };

  const chartData = getChartData();
  const pieData = getPieData();
  const projectData = getProjectData();
  const dailyData = getDailyData();

  const COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];

  // ========== EXPORT PDF ==========
  const exportPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text("Smart Timesheet Report", 20, 25);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35);
    doc.text(`User: ${user?.name || user?.email || "User"}`, 20, 42);

    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Summary", 20, 55);

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Total Time: ${totalTime} mins (${Math.round(totalTime / 60)} hours)`,
      20,
      63,
    );
    doc.text(`Total Activities: ${filteredActivities.length}`, 20, 70);
    doc.text(`Total Projects: ${projects.length}`, 20, 77);

    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Activity Details", 20, 90);

    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);

    let y = 98;
    filteredActivities.forEach((act, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const cat = classifyActivity(act.appName);
      const cleanCategory = cat.replace(/[^\w\s]/g, "").trim();
      doc.setDrawColor(230, 230, 230);
      doc.line(20, y - 2, 190, y - 2);
      doc.text(`${i + 1}. ${act.appName} - ${act.duration} mins`, 20, y);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `${cleanCategory}${act.project ? " | " + act.project : ""}`,
        20,
        y + 4,
      );
      doc.setTextColor(60, 60, 60);
      y += 10;
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text("Category Summary", 20, 25);

    const summaryData = getChartData();
    let y2 = 35;
    if (totalTime > 0) {
      summaryData.forEach((item) => {
        const cleanName = item.full
          ? item.full.replace(/[^\w\s]/g, "").trim()
          : item.category;
        const percentage = Math.round((item.time / totalTime) * 100);
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(
          `${cleanName || "Other"}: ${item.time} mins (${percentage}%)`,
          20,
          y2,
        );
        const barWidth = (percentage / 100) * 150;
        doc.setDrawColor(200, 200, 200);
        doc.rect(20, y2 + 2, 150, 3);
        doc.setFillColor(59, 130, 246);
        doc.rect(20, y2 + 2, barWidth, 3, "F");
        y2 += 12;
      });
    } else {
      doc.text("No data available", 20, 35);
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Page ${i} of ${pageCount}`, 180, 285);
      doc.text("Generated by Smart Timesheet", 20, 285);
    }

    doc.save("timesheet_report.pdf");
    toast.success("✅ PDF downloaded!");
  };

  // ========== EXPORT CSV ==========
  const exportCSV = () => {
    const cleanCategory = (cat: string) => cat.replace(/[^\w\s]/g, "").trim();

    const headers = [
      "Sl No",
      "App Name",
      "Duration (mins)",
      "Category",
      "Project",
      "Date",
    ];
    const rows = filteredActivities.map((act, index) => [
      index + 1,
      act.appName || "",
      act.duration || 0,
      cleanCategory(classifyActivity(act.appName)),
      act.project || "",
      new Date(act.$createdAt).toLocaleDateString(),
    ]);

    let csv = "\uFEFF";
    csv += headers.join(",") + "\n";
    rows.forEach((row) => {
      const cleanRow = row.map((field) => {
        if (typeof field === "string" && field.includes(","))
          return `"${field}"`;
        return field;
      });
      csv += cleanRow.join(",") + "\n";
    });

    csv += "\nSUMMARY\n";
    csv += `Total Time,${totalTime} mins (${Math.round(totalTime / 60)} hours)\n`;
    csv += `Total Activities,${filteredActivities.length}\n`;
    csv += `Total Projects,${projects.length}\n`;

    csv += "\nCategory Breakdown\n";
    csv += "Category,Time (mins),Percentage\n";
    const summaryData = getChartData();
    if (totalTime > 0) {
      summaryData.forEach((item) => {
        const cleanName = item.full
          ? item.full.replace(/[^\w\s]/g, "").trim()
          : item.category;
        const percentage = Math.round((item.time / totalTime) * 100);
        csv += `${cleanName || "Other"},${item.time},${percentage}%\n`;
      });
    }

    csv += "\nProject Breakdown\n";
    csv += "Project,Time (mins),Percentage\n";
    if (totalTime > 0) {
      projectData.forEach((project) => {
        const percentage = Math.round((project.time / totalTime) * 100);
        csv += `${project.name},${project.time},${percentage}%\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("✅ CSV downloaded!");
  };

  // ========== EXPORT EXCEL ==========
  const exportExcel = () => {
    const data = filteredActivities.map((act) => ({
      "Sl No": filteredActivities.indexOf(act) + 1,
      "App Name": act.appName || "",
      "Duration (mins)": act.duration || 0,
      Category: classifyActivity(act.appName)
        .replace(/[^\w\s]/g, "")
        .trim(),
      Project: act.project || "",
      Date: new Date(act.$createdAt).toLocaleDateString(),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheet");

    // Add summary sheet
    const summaryData = [
      ["SUMMARY"],
      ["Total Time", `${totalTime} mins (${Math.round(totalTime / 60)} hours)`],
      ["Total Activities", filteredActivities.length],
      ["Total Projects", projects.length],
      [],
      ["Category Breakdown"],
      ["Category", "Time (mins)", "Percentage"],
    ];
    const chartDataForSummary = getChartData();
    if (totalTime > 0) {
      chartDataForSummary.forEach((item) => {
        const cleanName = item.full
          ? item.full.replace(/[^\w\s]/g, "").trim()
          : item.category;
        const percentage = Math.round((item.time / totalTime) * 100);
        summaryData.push([cleanName || "Other", item.time, `${percentage}%`]);
      });
    }
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    XLSX.writeFile(
      wb,
      `timesheet_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast.success("✅ Excel downloaded!");
  };

  // ========== LOGIN SCREEN ==========
  if (showLogin) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${darkMode ? "bg-gray-900" : "bg-gray-100"}`}
      >
        <Toaster position="top-right" />
        <div
          className={`p-8 rounded-lg shadow-lg w-96 ${darkMode ? "bg-gray-800 text-white" : "bg-white"}`}
        >
          <h1 className="text-2xl font-bold text-center mb-6">
            {isLogin ? "🔐 Login" : "📝 Create Account"}
          </h1>
          <form onSubmit={isLogin ? handleLogin : handleSignup}>
            {!isLogin && (
              <input
                type="text"
                placeholder="Full Name"
                className={`w-full p-3 border rounded mb-3 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              className={`w-full p-3 border rounded mb-3 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password (min 8 characters)"
              className={`w-full p-3 border rounded mb-4 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 font-semibold"
            >
              {isLogin ? "Login" : "Sign Up"}
            </button>
          </form>
          <button
            onClick={handleDemoLogin}
            className="w-full mt-2 text-sm text-blue-500 hover:underline"
          >
            🚀 Try Demo Account
          </button>
          <p className="text-center mt-4 text-sm">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              className="text-blue-500 ml-1 hover:underline"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Sign Up" : "Login"}
            </button>
          </p>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="text-sm px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
            >
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== MAIN DASHBOARD ==========
  return (
    <div
      className={`min-h-screen ${darkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}
    >
      <Toaster position="top-right" />
      <div className="max-w-7xl mx-auto p-6">
        {/* ===== HEADER ===== */}
        <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold">⏱️ Smart Timesheet</h1>
            <p className={darkMode ? "text-gray-400" : "text-gray-600"}>
              Welcome back, {user?.name || user?.email || "User"}!
              <span className="ml-2 text-sm opacity-60">
                🕐 {currentTime.toLocaleTimeString()}
              </span>
              <span className="ml-2 text-xs opacity-50">
                (Ctrl+A to add sample data)
              </span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-3 py-2 rounded-lg text-sm ${darkMode ? "bg-gray-700 text-white" : "bg-gray-200"}`}
            >
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button
              onClick={toggleTracking}
              className={`px-4 py-2 rounded-lg text-sm ${isTracking ? "bg-red-500 text-white animate-pulse" : "bg-blue-500 text-white"}`}
            >
              {isTracking ? "⏹️ Stop Tracking" : "▶️ Start Tracking"}
            </button>
            <button
              onClick={addSampleActivity}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 text-sm"
            >
              + Add Sample
            </button>
            <button
              onClick={exportPDF}
              className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 text-sm"
            >
              📄 PDF
            </button>
            <button
              onClick={exportCSV}
              className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 text-sm"
            >
              📊 CSV
            </button>
            <button
              onClick={exportExcel}
              className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 text-sm"
            >
              📈 Excel
            </button>
            <button
              onClick={clearActivities}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm"
            >
              Clear All
            </button>
            <button
              onClick={handleLogout}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* ===== FILTERS & SEARCH ===== */}
        <div
          className={`flex gap-4 mb-6 flex-wrap ${darkMode ? "bg-gray-800" : "bg-white"} p-4 rounded-lg shadow`}
        >
          <div>
            <label className="text-sm font-medium">Project</label>
            <select
              className={`ml-2 p-2 border rounded ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="All">All Projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Date</label>
            <select
              className={`ml-2 p-2 border rounded ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium">Search</label>
            <input
              type="text"
              placeholder="🔍 Search by app name..."
              className={`ml-2 p-2 border rounded w-full md:w-64 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : ""}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* ===== STATS CARDS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div
            className={`p-4 rounded-lg shadow ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <p className="text-sm opacity-70">⏱️ Total Time</p>
            <p className="text-2xl font-bold text-blue-500">{totalTime} min</p>
            <p className="text-xs opacity-60">
              {Math.round(totalTime / 60)} hrs
            </p>
          </div>
          <div
            className={`p-4 rounded-lg shadow ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <p className="text-sm opacity-70">📋 Activities</p>
            <p className="text-2xl font-bold text-green-500">
              {filteredActivities.length}
            </p>
          </div>
          <div
            className={`p-4 rounded-lg shadow ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <p className="text-sm opacity-70">📁 Projects</p>
            <p className="text-2xl font-bold text-purple-500">
              {projects.length}
            </p>
          </div>
          <div
            className={`p-4 rounded-lg shadow ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <p className="text-sm opacity-70">📊 This Week</p>
            <p className="text-2xl font-bold text-orange-500">
              {weeklyStats.total} min
            </p>
            <p className="text-xs opacity-60">{weeklyStats.count} activities</p>
          </div>
        </div>

        {/* ===== CHARTS ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Bar Chart */}
          <div
            className={`p-4 rounded-lg shadow ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <h3 className="text-lg font-semibold mb-4">📊 Time by Category</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="category"
                    stroke={darkMode ? "#a0aec0" : "#666"}
                  />
                  <YAxis stroke={darkMode ? "#a0aec0" : "#666"} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: darkMode ? "#1a1a2e" : "#fff",
                      color: darkMode ? "#fff" : "#000",
                    }}
                  />
                  <Bar dataKey="time" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center opacity-60 py-10">No data to display</p>
            )}
          </div>

          {/* Pie Chart */}
          <div
            className={`p-4 rounded-lg shadow ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <h3 className="text-lg font-semibold mb-4">
              🧩 Category Distribution
            </h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: darkMode ? "#1a1a2e" : "#fff",
                      color: darkMode ? "#fff" : "#000",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center opacity-60 py-10">No data to display</p>
            )}
          </div>
        </div>

        {/* ===== DAILY TREND CHART ===== */}
        {dailyData.length > 0 && (
          <div
            className={`p-4 rounded-lg shadow mb-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <h3 className="text-lg font-semibold mb-4">
              📈 Daily Activity Trend
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyData}>
                <XAxis dataKey="date" stroke={darkMode ? "#a0aec0" : "#666"} />
                <YAxis stroke={darkMode ? "#a0aec0" : "#666"} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: darkMode ? "#1a1a2e" : "#fff",
                    color: darkMode ? "#fff" : "#000",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="time"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ===== PROJECT ANALYTICS ===== */}
        {projectData.length > 0 && (
          <div
            className={`p-4 rounded-lg shadow mb-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <h3 className="text-lg font-semibold mb-4">
              📊 Project Time Distribution
            </h3>
            <div className="space-y-3">
              {projectData.map((project, index) => (
                <div key={project.name}>
                  <div className="flex justify-between text-sm">
                    <span>{project.name}</span>
                    <span>
                      {project.time} mins (
                      {Math.round((project.time / totalTime) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(project.time / totalTime) * 100}%`,
                        backgroundColor: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== ACTIVITY LIST ===== */}
        <div
          className={`rounded-lg shadow p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}
        >
          <h2 className="text-xl font-semibold mb-4">📋 Activities</h2>
          {loading ? (
            <div className="text-center py-10 opacity-60">Loading...</div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-10">
              <p className="opacity-60">No activities match your filters.</p>
              <p className="text-sm opacity-40 mt-1">
                Try changing filters or add sample data
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity) => {
                const isApproved =
                  approvedActivities.includes(activity.$id) ||
                  activity.status === "approved";
                return (
                  <div
                    key={activity.$id}
                    className={`flex items-center justify-between border-b pb-3 hover:bg-gray-50 p-2 rounded ${
                      darkMode ? "hover:bg-gray-700 border-gray-700" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {activity.appName || "Unknown"}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm opacity-70">
                        <span>{activity.duration || 0} mins</span>
                        <span>•</span>
                        <span>{classifyActivity(activity.appName)}</span>
                        {activity.project && (
                          <>
                            <span>•</span>
                            <span className="text-blue-500">
                              📁 {activity.project}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-xs opacity-50">
                          {new Date(activity.$createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {isApproved ? (
                      <span className="text-green-500 text-sm font-semibold">
                        ✅ Approved
                      </span>
                    ) : (
                      <button
                        onClick={() => approveActivity(activity.$id)}
                        className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600 text-sm"
                      >
                        Approve ✓
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== FOOTER NOTE ===== */}
        <div
          className={`mt-6 p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-yellow-50"} border ${
            darkMode ? "border-gray-700" : "border-yellow-200"
          }`}
        >
          <p
            className={`text-sm ${darkMode ? "text-gray-300" : "text-yellow-800"}`}
          >
            💡 <strong>Features:</strong> AI Classification • Charts •
            PDF/CSV/Excel Export • Dark Mode • Live Timer • Search • Keyboard
            Shortcuts (Ctrl+A)
            <br />
            🚀 <strong>Shortcuts:</strong> Ctrl+A = Add Sample Data • Escape =
            Clear Search
          </p>
        </div>
      </div>
    </div>
  );
}

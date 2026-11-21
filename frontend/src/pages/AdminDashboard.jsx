import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardCheck, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { getSuperAdminReports, getSuperAdminStats } from "../services/api";
import "../styles/pages.css";

const reportViews = [
  ["lost", "Lost reports"],
  ["found", "Found reports"],
  ["resolved", "Resolved reports"],
];

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [view, setView] = useState("lost");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [reportsKey, setReportsKey] = useState("");
  const [reportError, setReportError] = useState(null);
  const queryKey = `${view}:${page}`;
  const reportsLoading = reportsKey !== queryKey;
  const reportsError = reportError?.key === queryKey ? reportError.message : "";

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");
    try {
      const summary = await getSuperAdminStats();
      setStats(summary);
    } catch (error) {
      setStatsError(error.message || "Unable to load administrative statistics.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(loadStats); }, [loadStats]);

  useEffect(() => {
    let active = true;
    getSuperAdminReports(view, page).then((result) => {
      if (!active) return;
      setReports(result.data);
      setPagination(result.pagination);
      setReportsKey(`${view}:${page}`);
    }).catch((error) => {
      if (active) {
        setReportError({ key: `${view}:${page}`, message: error.message || "Unable to load reports." });
        setReportsKey(`${view}:${page}`);
      }
    });
    return () => { active = false; };
  }, [view, page]);

  const cards = [
    { label: "Total lost reports", value: stats?.lostReports, icon: ArrowLeft },
    { label: "Total found reports", value: stats?.foundReports, icon: ShieldCheck },
    { label: "Total resolved reports", value: stats?.resolvedReports, icon: ClipboardCheck },
    { label: "Pending applications", value: stats?.pendingApplications, icon: Users },
    { label: "Approved applications", value: stats?.approvedApplications, icon: Users },
    { label: "Active assignments", value: stats?.activeAssignments, icon: ClipboardCheck },
  ];

  return <div className="page-container admin-dashboard-page super-admin-dashboard">
    <div className="page-heading-row">
      <div><span className="eyebrow">FINDBACK OPERATIONS</span><h1>Super Admin dashboard</h1><p>Monitor item reports and manage area-scoped Local Admin access.</p></div>
      <span className="admin-label">Single administrator account</span>
    </div>

    {statsError && <div className="dashboard-alert" role="alert"><span>{statsError}</span><button className="button button-secondary" type="button" onClick={loadStats}>Try again</button></div>}
    <section className="super-admin-stat-grid" aria-label="Database-backed statistics" aria-busy={statsLoading}>
      {cards.map(({ label, value, icon: Icon }) => <article className="stat-card admin-live-stat" key={label}>
        <div className="stat-icon"><Icon size={21} /></div><p>{label}</p><h2>{statsLoading || statsError ? "—" : value}</h2>
      </article>)}
    </section>

    <section className="content-panel super-admin-reports-panel">
      <div className="panel-heading super-admin-panel-heading"><div><span className="eyebrow">ITEM MANAGEMENT</span><h2>Reports</h2><p>Found report details are available only in this authorized admin view.</p></div>
        <button className="button button-secondary" type="button" onClick={loadStats} disabled={statsLoading}><RefreshCw size={16} /> Refresh overview</button>
      </div>
      <div className="filter-tabs super-admin-report-filters" aria-label="Filter reports">
        {reportViews.map(([value, label]) => <button type="button" key={value} className={`filter-tab ${view === value ? "filter-tab-active" : ""}`} aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{label}</button>)}
      </div>
      {reportsError && <p className="form-error" role="alert">{reportsError}</p>}
      {reportsLoading ? <div className="content-panel loading-state" role="status">Loading reports…</div> : reportsError ? null : reports.length === 0 ? <div className="empty-state"><h3>No {view} reports</h3><p>Reports in this view will appear here.</p></div> : <div className="super-admin-table-scroll">
        <table className="super-admin-report-table">
          <thead><tr><th>Item / owner</th><th>Type</th><th>Status</th><th>Category</th><th>Location</th><th>Reported</th></tr></thead>
          <tbody>{reports.map((report) => <tr key={report.id}>
            <td><strong>{report.title}</strong><small>{report.owner ? `${report.owner.name} · ${report.owner.email}` : "Reporter unavailable"}</small>{report.description && <small className="admin-report-description">{report.description}</small>}</td>
            <td>{report.type}</td><td><span className={`super-admin-report-status status-${report.status}`}>{report.status}</span></td><td>{report.category}</td><td>{report.location}</td><td>{formatDate(report.date)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!reportsLoading && !reportsError && pagination.totalPages > 1 && <div className="super-admin-pagination"><span>{pagination.total} reports · page {pagination.page} of {pagination.totalPages}</span><div><button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="button button-secondary" type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
    </section>

    <section className="content-panel"><div className="panel-heading"><div><h2>Administrative actions</h2><p>Every review and assignment action is checked and recorded by the backend.</p></div><ShieldCheck size={21} /></div>
      <div className="admin-actions-grid">
        <article className="admin-action-card"><div className="feature-icon"><Users size={22} /></div><h3>Local Admin applications</h3><p>Review pending, approved, and rejected applications. Approval does not assign an area.</p><Link to="/admin/local-admin-applications" className="text-link">Manage applications <ArrowRight size={16} /></Link></article>
        <article className="admin-action-card"><div className="feature-icon"><ClipboardCheck size={22} /></div><h3>Area assignments</h3><p>Assign approved applicants to specific service areas and revoke access when needed.</p><Link to="/admin/local-admins" className="text-link">Manage assignments <ArrowRight size={16} /></Link></article>
        <article className="admin-action-card"><div className="feature-icon"><ShieldCheck size={22} /></div><h3>Escalated claims</h3><p>Review failed ownership verification and reported issues without changing attempt history.</p><Link to="/admin/review" className="text-link">Open claim review <ArrowRight size={16} /></Link></article>
      </div>
    </section>
    <div className="admin-warning"><AlertTriangle size={20} /><p><strong>Access boundary:</strong> Local Admins receive only active area assignments. Report ownership verification and OTP protections remain in force.</p></div>
  </div>;
}

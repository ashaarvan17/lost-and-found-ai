import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, FilePlus2, MapPin, Package, Search, ShieldCheck, Sparkles } from "lucide-react";
import { getMyClaims, getMyMatches, getMyReports } from "../services/api";
import "../styles/pages.css";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

export default function Dashboard() {
  const { user } = useOutletContext();
  const [data, setData] = useState({ reports: [], matches: [], claims: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(() => Promise.all([getMyReports(), getMyMatches(), getMyClaims()]), []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const [reports, matches, claims] = await fetchDashboard(); setData({ reports, matches, claims }); }
    catch (err) { setError(err.message || "Unable to load your overview."); }
    finally { setLoading(false); }
  }, [fetchDashboard]);

  useEffect(() => {
    let active = true;
    fetchDashboard().then(([reports, matches, claims]) => { if (active) setData({ reports, matches, claims }); })
      .catch((err) => { if (active) setError(err.message || "Unable to load your overview."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchDashboard]);

  const lostCount = data.reports.filter((report) => report.type === "lost").length;
  const foundCount = data.reports.filter((report) => report.type === "found").length;
  const activeClaims = data.claims.filter((claim) => !["resolved", "cancelled", "rejected", "closed"].includes(claim.status)).length;
  const stats = [
    { label: "Your reports", value: data.reports.length, icon: Package, color: "indigo", detail: `${lostCount} lost · ${foundCount} found` },
    { label: "Possible matches", value: data.matches.length, icon: Sparkles, color: "violet", detail: "Restricted indications" },
    { label: "Active claims", value: activeClaims, icon: ShieldCheck, color: "green", detail: "Verification and recovery" },
  ];

  return <div className="dashboard-page">
    <section className="dashboard-welcome">
      <div><span className="dashboard-greeting">YOUR FINDBACK OVERVIEW</span><h1>Welcome{user?.name ? `, ${user.name.split(/\s+/)[0]}` : " back"}</h1><p>Track your own reports, possible match indications, and active claims.</p></div>
      <Link to="/report" className="button button-primary dashboard-report-btn"><FilePlus2 size={18} /> Report an item</Link>
    </section>

    {error && <div className="dashboard-alert" role="alert"><span>{error}</span><button type="button" className="button button-secondary" onClick={load}>Try again</button></div>}

    <section className="dashboard-stats" aria-label="Your activity" aria-busy={loading}>
      {stats.map(({ label, value, icon: Icon, color, detail }) => <article className="dashboard-stat-card" key={label}>
        <div className="dashboard-stat-top"><div className={`dashboard-stat-icon ${color}`}><Icon size={22} /></div><CheckCircle2 size={17} className="dashboard-stat-arrow" /></div>
        <p className="dashboard-stat-label">{label}</p><h2>{loading || error ? "—" : value}</h2><p className="dashboard-stat-description">{loading ? "Loading your data…" : detail}</p>
      </article>)}
    </section>

    <section className="dashboard-quick-section">
      <div className="dashboard-section-heading"><div><h2>Quick actions</h2><p>Pick up where you need to.</p></div></div>
      <div className="dashboard-quick-grid">
        <Link to="/report" className="dashboard-quick-card"><div className="dashboard-quick-icon indigo"><FilePlus2 size={22} /></div><div><h3>Report an item</h3><p>Submit a lost or found report.</p></div><ArrowRight size={18} className="dashboard-quick-arrow" /></Link>
        <Link to="/browse" className="dashboard-quick-card"><div className="dashboard-quick-icon violet"><Search size={22} /></div><div><h3>Browse lost reports</h3><p>Search items made public by their reporters.</p></div><ArrowRight size={18} className="dashboard-quick-arrow" /></Link>
        <Link to="/claims" className="dashboard-quick-card"><div className="dashboard-quick-icon lavender"><ShieldCheck size={22} /></div><div><h3>Review claims</h3><p>Continue a verification or recovery.</p></div><ArrowRight size={18} className="dashboard-quick-arrow" /></Link>
      </div>
    </section>

    <section className="dashboard-panel dashboard-live-reports">
      <div className="dashboard-section-heading"><div><h2>Your recent reports</h2><p>Only reports created by your account appear here.</p></div><Link to="/my-reports" className="dashboard-view-all">View all <ArrowRight size={15} /></Link></div>
      {loading ? <p className="dashboard-empty">Loading your reports…</p> : error ? <p className="dashboard-empty">Your reports are unavailable until the connection is restored.</p> : data.reports.length === 0 ? <div className="dashboard-empty"><ClipboardList size={24} /><p>You have not submitted a report yet.</p><Link to="/report" className="text-link">Create your first report <ArrowRight size={15} /></Link></div> : <div className="dashboard-reports-list">{data.reports.slice(0, 4).map((report) => <article className="dashboard-report-item" key={report._id}>
        <div className="dashboard-report-icon">{report.type === "lost" ? <Search size={20} /> : <Package size={20} />}</div>
        <div className="dashboard-report-details"><div className="dashboard-report-title-row"><h3>{report.title}</h3><span className={`dashboard-type-badge ${report.type}`}>{report.type === "lost" ? "Lost" : "Found · private"}</span></div><p>{report.category}</p><div className="dashboard-report-meta"><span><MapPin size={13} />{report.location}</span><span><CalendarDays size={13} />{formatDate(report.createdAt)}</span></div></div>
        <span className="dashboard-status searching">{report.status || "Active"}</span>
      </article>)}</div>}
    </section>

    <section className="dashboard-panel dashboard-live-matches"><div className="dashboard-section-heading"><div><h2><Sparkles size={19} /> Possible match indications</h2><p>Found report details stay private until verification.</p></div><Link to="/matches" className="dashboard-view-all">View matches <ArrowRight size={15} /></Link></div>
      {loading ? <p className="dashboard-empty">Checking your match indications…</p> : error ? <p className="dashboard-empty">Match indications are unavailable until the connection is restored.</p> : data.matches.length === 0 ? <p className="dashboard-empty">No possible matches are available for your lost reports yet.</p> : <div className="dashboard-match-list">{data.matches.slice(0, 3).map((match) => <article className="dashboard-match-card" key={match.id}><div className="dashboard-match-top"><span className="dashboard-match-category">{match.lostReport?.category || "Lost report"}</span><span className="dashboard-match-score"><ShieldCheck size={13} />Possible match</span></div><div className="dashboard-match-items"><div><span>YOUR LOST ITEM</span><h3>{match.lostReport?.title || "Your report"}</h3></div><ArrowRight size={18} /><div><span>FOUND REPORT</span><h3>Details protected</h3></div></div><Link to="/matches" className="dashboard-review-link">Review indication <ArrowRight size={15} /></Link></article>)}</div>}
      <div className="dashboard-ai-note"><ShieldCheck size={17} /><p>A possible match is not proof of ownership. Answer verification questions before communication is enabled.</p></div>
    </section>
  </div>;
}

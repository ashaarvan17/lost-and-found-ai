import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, MapPin, RefreshCw, ShieldX, UserRound } from "lucide-react";
import { getLocalAdminApplications, reviewLocalAdminApplication } from "../services/api";
import "../styles/pages.css";

export default function LocalAdminApplications() {
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchRows = useCallback(() => getLocalAdminApplications(), []);
  const setRows = useCallback((rows) => {
    setApplications(rows);
    setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || "");
  }, []);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRows());
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load Local Admin applications.");
    } finally {
      setLoading(false);
    }
  }, [fetchRows, setRows]);

  useEffect(() => {
    let active = true;
    fetchRows().then((rows) => { if (active) { setRows(rows); setError(""); } })
      .catch((err) => { if (active) setError(err.message || "Unable to load Local Admin applications."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchRows, setRows]);

  async function decide(application, action) {
    const reason = rejectionReasons[application.id] || "";
    if (action === "reject" && !reason.trim()) {
      setError("Add a short reason before rejecting an application.");
      return;
    }
    setBusyId(application.id);
    setError("");
    setNotice("");
    try {
      const result = await reviewLocalAdminApplication(application.id, action, reason.trim());
      setNotice(result.message);
      await reload();
    } catch (err) {
      setError(err.message || "Unable to review this application.");
    } finally {
      setBusyId("");
    }
  }

  const pendingCount = applications.filter((row) => row.status === "pending").length;
  const visibleApplications = applications.filter((row) => statusFilter === "all" || row.status === statusFilter);

  return <div className="page-container admin-applications-page">
    <div className="page-heading-row">
      <div><span className="eyebrow">SUPER ADMIN</span><h1>Local Admin applications</h1><p>Review each request. Approval does not assign an operating area.</p></div>
      <button className="button button-secondary" type="button" onClick={reload} disabled={loading}><RefreshCw size={16} /> Refresh</button>
    </div>

    <div className="application-summary"><Clock3 size={18} /><span><strong>{pendingCount}</strong> pending {pendingCount === 1 ? "application" : "applications"}</span><label className="admin-status-filter">Status <select aria-label="Filter applications by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); const next = applications.find((row) => event.target.value === "all" || row.status === event.target.value); setSelectedId(next?.id || ""); }}><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {loading ? <section className="content-panel loading-state" aria-live="polite">Loading applications…</section> : error && applications.length === 0 ? <section className="content-panel empty-state"><h2>Applications unavailable</h2><p>Refresh the page when the administrative service is available.</p></section> : applications.length === 0 ? <section className="content-panel empty-state"><UserRound size={24} /><h2>No applications yet</h2><p>New Local Admin requests will appear here after submission.</p></section> : visibleApplications.length === 0 ? <section className="content-panel empty-state"><UserRound size={24} /><h2>No {statusFilter} applications</h2><p>Choose another status to view Local Admin applications.</p></section> : <div className="admin-review-layout">
      <nav className="application-list" aria-label="Local Admin applications">
        {visibleApplications.map((row) => <button key={row.id} type="button" className={`application-list-row ${selectedId === row.id ? "application-list-row-active" : ""}`} onClick={() => setSelectedId(row.id)}>
          <span className="application-list-name">{row.applicant.name}</span><span>{row.requestedArea}</span><small>{new Date(row.createdAt).toLocaleDateString()}</small><span className={`application-status status-${row.status}`}>{row.status}</span>
        </button>)}
      </nav>
      {visibleApplications.filter((row) => row.id === selectedId).map((row) => <article className="content-panel application-detail" key={row.id}>
        <div className="application-detail-header"><div><span className="eyebrow">APPLICATION</span><h2>{row.applicant.name}</h2><a href={`mailto:${encodeURIComponent(row.applicant.email)}`}>{row.applicant.email}</a></div><span className={`application-status status-${row.status}`}>{row.status}</span></div>
        <dl className="application-facts">
          <div><dt>Requested area</dt><dd><MapPin size={15} />{row.requestedArea}</dd></div>
          <div><dt>Submitted</dt><dd>{new Date(row.createdAt).toLocaleString()}</dd></div>
          {row.phone && <div><dt>Phone</dt><dd>{row.phone}</dd></div>}
          {row.verificationDetails && <div className="application-fact-wide"><dt>Additional details</dt><dd>{row.verificationDetails}</dd></div>}
          {row.rejectionReason && <div className="application-fact-wide"><dt>Decision reason</dt><dd>{row.rejectionReason}</dd></div>}
        </dl>
        {row.status === "pending" ? <div className="application-review-actions">
          <label className="form-field"><span>Rejection reason</span><textarea rows="3" maxLength="1000" value={rejectionReasons[row.id] || ""} onChange={(event) => setRejectionReasons((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Required if rejecting" /></label>
          <div className="application-action-buttons"><button className="button button-secondary" type="button" disabled={busyId === row.id} onClick={() => decide(row, "reject")}><ShieldX size={16} /> Reject</button><button className="button button-primary" type="button" disabled={busyId === row.id} onClick={() => decide(row, "approve")}><Check size={16} /> {busyId === row.id ? "Saving…" : "Approve application"}</button></div>
        </div> : <p className="auth-approval-notice">An approved applicant still needs a separate, active area assignment before Local Admin recovery tasks are available.</p>}
      </article>)}
    </div>}
  </div>;
}

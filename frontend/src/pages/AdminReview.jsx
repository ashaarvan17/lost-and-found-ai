import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, RefreshCw } from "lucide-react";
import { getAdminReviewDetails, getAdminReviewQueue, performAdminReviewAction } from "../services/api";
import "../styles/pages.css";

const actions = [
  ["request_information", "Request information"], ["approve", "Approve reviewed claim"],
  ["reject", "Reject claim"], ["escalate", "Escalate case"], ["close", "Close case"],
];

export default function AdminReview() {
  const [queue, setQueue] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function reloadQueue() {
    setBusy(true); setError("");
    try { const rows = await getAdminReviewQueue(); setQueue(rows); if (selectedId && rows.some((row) => row.id === selectedId)) await loadDetails(selectedId); else if (!rows.length) { setDetails(null); setSelectedId(""); } }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function loadDetails(id) {
    setSelectedId(id); setError("");
    try { setDetails(await getAdminReviewDetails(id)); }
    catch (err) { setDetails(null); setError(err.message); }
  }
  useEffect(() => {
    let active = true;
    getAdminReviewQueue().then((rows) => {
      if (!active) return;
      setQueue(rows);
      if (!rows.length) { setDetails(null); setSelectedId(""); }
    }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function applyAction(action) {
    if (reason.trim().length < 5) { setError("Provide a reason of at least 5 characters."); return; }
    setBusy(true); setError("");
    try { await performAdminReviewAction(selectedId, action, reason); setReason(""); await reloadQueue(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="page-container"><Link to="/admin" className="back-link"><ArrowLeft size={17} /> Super Admin dashboard</Link><div className="page-heading-row"><div><span className="eyebrow">SUPER ADMIN</span><h1>Claim review</h1><p>Review escalated verification cases and reported issues. Review actions are recorded with your identity and reason.</p></div><button type="button" className="button button-secondary" onClick={reloadQueue} disabled={busy}><RefreshCw size={16} /> Refresh</button></div>
    {error && <p role="alert" className="form-info">{error}</p>}
    <div className="admin-review-layout"><section className="content-panel"><h2>Review queue</h2>{queue.length === 0 ? <p>{busy ? "Loading…" : "No cases need review."}</p> : queue.map((row) => <button type="button" className={`admin-review-row ${selectedId === row.id ? "admin-review-row-active" : ""}`} key={row.id} onClick={() => loadDetails(row.id)}><strong>{row.status.replaceAll("_", " ")}</strong><span>{row.valueTier} tier · {row.attemptCount} attempts</span><small>{new Date(row.createdAt).toLocaleString()}</small></button>)}</section>
      <section className="content-panel"><h2><ClipboardCheck size={20} /> Case details</h2>{!details ? <p>Select a case. Sensitive verification answers are not displayed here.</p> : <><p><strong>Status:</strong> {details.status} · <strong>Tier:</strong> {details.valueTier} · <strong>Attempts:</strong> {details.attemptCount}</p><div className="admin-review-items"><div><h3>Lost report</h3><p>{details.lostItem?.title || "Unavailable"} · {details.lostItem?.category || ""}</p><small>{details.lostItem?.location || ""}</small></div><div><h3>Found report</h3><p>{details.foundItem?.title || "Unavailable"} · {details.foundItem?.category || ""}</p><small>{details.foundItem?.location || ""}</small></div></div><h3>Verification attempt history</h3>{details.attempts.map((attempt) => <p key={`${attempt.number}-${attempt.createdAt}`}>Attempt {attempt.number}: {attempt.outcome} · {new Date(attempt.createdAt).toLocaleString()}</p>)}<h3>Review audit</h3>{details.reviewHistory.map((event, index) => <p key={`${event.createdAt}-${index}`}><strong>{event.action}</strong> by {event.actorRole} · {new Date(event.createdAt).toLocaleString()}<br />{event.reason}</p>)}<label className="form-field"><span>Required reason for action</span><textarea rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="admin-review-actions">{actions.map(([action, title]) => <button type="button" key={action} className={action === "reject" ? "button button-secondary" : "button button-primary"} disabled={busy} onClick={() => applyAction(action)}>{title}</button>)}</div></>}</section></div>
  </div>;
}

import { useCallback, useEffect, useState } from "react";
import { getMyLocalAdminAssignments, getRecoveryTasks, validateRecoveryOtp } from "../services/api";
import "../styles/pages.css";

export default function RecoveryTasks() {
  const [rows, setRows] = useState([]); const [codes, setCodes] = useState({}); const [error, setError] = useState("");
  const [areas, setAreas] = useState([]); const [loading, setLoading] = useState(true);
  const fetchData = useCallback(() => Promise.all([getRecoveryTasks(), getMyLocalAdminAssignments()]), []);
  const reload = useCallback(async () => { setLoading(true); try { const [tasks, assignments] = await fetchData(); setRows(tasks); setAreas(assignments); setError(""); } catch (err) { setError(err.message); } finally { setLoading(false); } }, [fetchData]);
  useEffect(() => {
    let active = true;
    fetchData().then(([tasks, assignments]) => { if (active) { setRows(tasks); setAreas(assignments); setError(""); } }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchData]);
  async function validate(id) { try { await validateRecoveryOtp(id, codes[id] || ""); setCodes((prev) => ({ ...prev, [id]: "" })); await reload(); } catch (err) { setError(err.message); } }
  return <div className="page-container"><div className="page-heading-row"><div><span className="eyebrow">ASSIGNED CUSTODY TASKS</span><h1>Local Admin recovery</h1><p>Work only within your active area assignments. Custody changes after backend OTP validation.</p></div><button className="button button-secondary" type="button" disabled={loading} onClick={reload}>Refresh</button></div>{areas.length > 0 && <section className="content-panel"><h2>Your authorized areas</h2><div className="assigned-area-list">{areas.map((area) => <span className="application-status status-approved" key={area.id}>{area.assignedArea}</span>)}</div></section>}{error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading assigned tasks…</p> : rows.map((row) => <section className="content-panel" key={row.id}><h3>{row.purpose.replaceAll("_", " ")}</h3><p>Transaction {row.id} · {row.status} · Area: {row.area}</p>{row.status === "otp_issued" && <div><label>Six-digit OTP <input aria-label="Six-digit OTP" inputMode="numeric" maxLength={6} value={codes[row.id] || ""} onChange={(e) => setCodes((prev) => ({ ...prev, [row.id]: e.target.value }))} /></label><button className="button button-primary" type="button" onClick={() => validate(row.id)}>Validate and confirm custody</button></div>}</section>)}{!loading && rows.length === 0 && !error && <div className="content-panel empty-state"><h2>No pending recovery tasks</h2><p>You will see a deposit or collection here when one is assigned to your area.</p></div>}</div>;
}

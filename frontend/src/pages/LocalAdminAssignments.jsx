import { useCallback, useEffect, useState } from "react";
import {
  createLocalAdminAssignment,
  getLocalAdminAssignments,
  getLocalAdminApplications,
  updateLocalAdminAssignment,
} from "../services/api";
import "../styles/pages.css";

export default function LocalAdminAssignments() {
  const [rows, setRows] = useState([]);
  const [applications, setApplications] = useState([]);
  const [userId, setUserId] = useState("");
  const [area, setArea] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [assignments, allApplications] = await Promise.all([
        getLocalAdminAssignments(),
        getLocalAdminApplications(),
      ]);
      setRows(assignments);
      setApplications(allApplications.filter((row) => row.status === "approved"));
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load Local Admin assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getLocalAdminAssignments(), getLocalAdminApplications()])
      .then(([assignments, allApplications]) => {
        if (!active) return;
        setRows(assignments);
        setApplications(allApplications.filter((row) => row.status === "approved"));
      })
      .catch((err) => {
        if (active) setError(err.message || "Unable to load Local Admin assignments.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function appoint(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await createLocalAdminAssignment(userId, area.trim());
      setUserId("");
      setArea("");
      setNotice("Area assignment created.");
      await reload();
    } catch (err) {
      setError(err.message || "Unable to create the area assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function action(row, next) {
    const confirmation = next === "revoke"
      ? `Revoke ${row.name}'s assignment for ${row.assignedArea}?`
      : `${next === "activate" ? "Activate" : "Deactivate"} ${row.name}'s assignment for ${row.assignedArea}?`;
    if (!window.confirm(confirmation)) return;

    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      await updateLocalAdminAssignment(row.id, next);
      setNotice(`Assignment ${next === "revoke" ? "revoked" : `${next}d`}.`);
      await reload();
    } catch (err) {
      setError(err.message || "Unable to update the area assignment.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="page-container local-admin-assignments-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">SUPER ADMIN</span>
          <h1>Local Admin assignments</h1>
          <p>Approval and assignment are separate. Every recovery request is checked against the active area assignment.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={reload} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <form className="content-panel form-stack" onSubmit={appoint}>
        <div className="panel-heading">
          <div>
            <h2>Assign an approved applicant</h2>
            <p>Choose an approved applicant and confirm the area they are authorized to serve.</p>
          </div>
        </div>
        <label className="form-field">
          <span>Approved applicant</span>
          <select
            value={userId}
            onChange={(event) => {
              const selected = applications.find((application) => application.applicant.id === event.target.value);
              setUserId(event.target.value);
              if (selected) setArea(selected.requestedArea);
            }}
            required
            disabled={loading || saving || applications.length === 0}
          >
            <option value="">Choose an approved applicant</option>
            {applications.map((application) => (
              <option value={application.applicant.id} key={application.id}>
                {application.applicant.name} — {application.applicant.email}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Assigned area or location</span>
          <input value={area} onChange={(event) => setArea(event.target.value)} maxLength={200} required disabled={loading || saving} />
        </label>
        <div>
          <button className="button button-primary" type="submit" disabled={loading || saving || !applications.length}>
            {saving ? "Saving assignment…" : "Create area assignment"}
          </button>
          {!loading && applications.length === 0 && <p className="form-info">No approved applicants are ready for an area assignment.</p>}
        </div>
      </form>

      <section className="assignment-list" aria-busy={loading}>
        <h2>Current assignments</h2>
        {loading ? (
          <div className="content-panel loading-state" role="status">Loading area assignments…</div>
        ) : rows.length === 0 ? (
          <div className="content-panel empty-state">
            <h3>No area assignments yet</h3>
            <p>Assignments will appear here after an approved applicant is assigned to an operating area.</p>
          </div>
        ) : rows.map((row) => (
          <article className="content-panel assignment-card" key={row.id}>
            <div>
              <h3>{row.name}</h3>
              <p>{row.userId} · {row.assignedArea} · {row.isActive ? "Active" : row.revokedAt ? "Revoked" : "Inactive"}</p>
            </div>
            <div className="admin-review-actions">
              {row.isActive ? (
                <button className="button button-secondary" type="button" disabled={busyId === row.id} onClick={() => action(row, "deactivate")}>Deactivate</button>
              ) : !row.revokedAt ? (
                <button className="button button-secondary" type="button" disabled={busyId === row.id} onClick={() => action(row, "activate")}>Activate</button>
              ) : null}
              {!row.revokedAt && (
                <button className="button button-secondary" type="button" disabled={busyId === row.id} onClick={() => action(row, "revoke")}>Revoke</button>
              )}
              {busyId === row.id && <span role="status">Updating…</span>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

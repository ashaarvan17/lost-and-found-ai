
// frontend/src/pages/MyReports.jsx

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus, Search } from "lucide-react";
import { getMyReports, resolveImageUrl, updateOwnershipQuestions, getLocalAdminsForReport, getRecoveryTransactionsForReport, createDeposit, generateRecoveryOtp } from "../services/api";
import "../styles/pages.css";

function ReportImage({ report }) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const imageUrl = resolveImageUrl(report.imageUrl);

  if (!imageUrl || failedImageUrl === imageUrl) {
    return <FileText size={22} />;
  }

  return (
    <img
      src={imageUrl}
      alt={report.title}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
        borderRadius: "inherit",
      }}
      onError={() => setFailedImageUrl(imageUrl)}
    />
  );
}

function DepositPanel({ report }) {
  const [admins, setAdmins] = useState([]); const [transactions, setTransactions] = useState([]); const [assignmentId, setAssignmentId] = useState(""); const [otp, setOtp] = useState(""); const [message, setMessage] = useState("");
  async function reload() { try { const [a, t] = await Promise.all([getLocalAdminsForReport(report._id), getRecoveryTransactionsForReport(report._id)]); setAdmins(a); setTransactions(t); } catch (err) { setMessage(err.message); } }
  useEffect(() => {
    let active = true;
    Promise.all([getLocalAdminsForReport(report._id), getRecoveryTransactionsForReport(report._id)]).then(([available, existing]) => {
      if (active) { setAdmins(available); setTransactions(existing); }
    }).catch((err) => { if (active) setMessage(err.message); });
    return () => { active = false; };
  }, [report._id]);
  async function start() { try { await createDeposit(report._id, assignmentId); setMessage("Deposit transaction created. Generate its OTP below."); await reload(); } catch (err) { setMessage(err.message); } }
  async function generate(id) { try { const result = await generateRecoveryOtp(id); setOtp(result.otp); setMessage("Give this OTP to the assigned Local Admin only when handing over the item."); await reload(); } catch (err) { setMessage(err.message); } }
  return <section className="content-panel"><h3>Deposit with a Local Admin</h3>{admins.length > 0 && <div><select aria-label="Local Admin" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}><option value="">Select an assigned Local Admin</option>{admins.map((a) => <option value={a.assignmentId} key={a.assignmentId}>{a.name} · {a.area}</option>)}</select><button className="button button-secondary" type="button" disabled={!assignmentId} onClick={start}>Create deposit transaction</button></div>}{transactions.filter((tx) => tx.purpose === "local_admin_deposit").map((tx) => <p key={tx.id}>{tx.status} · {tx.id}{tx.status !== "completed" && <button type="button" className="button button-secondary" onClick={() => generate(tx.id)}>Generate deposit OTP</button>}</p>)}{otp && <p role="status"><strong>One-time deposit OTP: {otp}</strong></p>}{message && <p role="status">{message}</p>}</section>;
}

export default function MyReports() {
  const [filter, setFilter] = useState("All");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [questionDraft, setQuestionDraft] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function fetchReports() {
      try {
        setLoading(true);
        setError("");

        // Fetch only the logged-in user's reports
        const data = await getMyReports();

        setReports(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message || "Failed to load reports.");
      } finally {
        setLoading(false);
      }
    }

    fetchReports();
  }, []);

  const filteredReports = reports.filter((report) => {
    const reportType = String(report.type || "").toLowerCase();

    return filter === "All" || reportType === filter.toLowerCase();
  });

  function formatDate(date) {
    if (!date) return "Date unavailable";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Date unavailable";
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getReportStatus(report) {
    if (report.status === "resolved") return "Resolved";
    if (report.status === "closed") return "Closed";

    return "Active";
  }

  function editQuestions(report) {
    setEditingId(report._id);
    setQuestionDraft((report.ownershipQuestions || []).map(({ prompt }) => ({ prompt, expectedAnswer: "" })));
    setSaveMessage("");
  }

  async function saveQuestions(report) {
    try {
      await updateOwnershipQuestions(report._id, questionDraft);
      setSaveMessage({ id: report._id, text: "Questions saved for future claims. Existing claim snapshots are unchanged." });
      setEditingId("");
    } catch (err) { setSaveMessage({ id: report._id, text: err.message }); }
  }

  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">YOUR ACTIVITY</span>
          <h1>My Reports</h1>
          <p>Manage the lost and found reports you have submitted.</p>
        </div>

        <Link to="/report" className="button button-primary">
          <Plus size={17} /> New Report
        </Link>
      </div>

      <div className="filter-tabs" aria-label="Filter reports">
        {["All", "Lost", "Found"].map((type) => (
          <button
            key={type}
            type="button"
            className={`filter-tab ${
              filter === type ? "filter-tab-active" : ""
            }`}
            onClick={() => setFilter(type)}
            aria-pressed={filter === type}
          >
            {type === "All" ? "All Reports" : `${type} Items`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">
          <p>Loading your reports from the database...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <h3>Unable to load reports</h3>
          <p>{error}</p>

          <button
            type="button"
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      ) : filteredReports.length > 0 ? (
        <div className="content-panel report-list">
          {filteredReports.map((report) => {
            const type =
              String(report.type || "lost").toLowerCase() === "found"
                ? "Found"
                : "Lost";

            const status = getReportStatus(report);

            return (
              <article className="report-row" key={report._id}>
                <div className="report-row-icon">
                  <ReportImage report={report} />
                </div>

                <div className="report-row-content">
                  <h3>{report.title}</h3>

                  <p>
                    {type} · {report.category || "Uncategorized"} ·{" "}
                    {report.location || "Location unavailable"}
                  </p>

                  <small>Reported: {formatDate(report.date)}</small>

                  <div style={{ marginTop: "8px" }}>
                    <Link
                      to={`/items/${encodeURIComponent(report._id)}`}
                      className="item-card-link"
                    >
                      View Details
                    </Link>
                  </div>
                  {type === "Found" && <div style={{ marginTop: 10 }}><small>Verification tier: {report.valueTier || "Needs review"} · {report.estimatedReplacementValueInr ?? "—"} INR</small><div><button type="button" className="button button-secondary" onClick={() => editQuestions(report)}>Edit ownership questions</button></div>{editingId === report._id && <section className="content-panel"><p>Re-enter each expected answer. Only questions are shown here; answer verifiers stay private.</p>{questionDraft.map((question, index) => <div className="form-grid" key={index}><label className="form-field form-field-full"><span>Question {index + 1}</span><input value={question.prompt} onChange={(event) => setQuestionDraft((current) => current.map((row, i) => i === index ? { ...row, prompt: event.target.value } : row))} required /></label><label className="form-field form-field-full"><span>Expected answer {index + 1}</span><input value={question.expectedAnswer} onChange={(event) => setQuestionDraft((current) => current.map((row, i) => i === index ? { ...row, expectedAnswer: event.target.value } : row))} required /></label></div>)}<button type="button" className="button button-primary" onClick={() => saveQuestions(report)}>Save questions</button><button type="button" className="button button-secondary" onClick={() => setEditingId("")}>Cancel</button></section>}{saveMessage?.id === report._id && <p role="status">{saveMessage.text}</p>}</div>}
                  {type === "Found" && report.status === "active" && <DepositPanel report={report} />}
                </div>

                <div className="report-row-status">
                  <span
                    className={`status-badge-inline status-${status.toLowerCase()}`}
                  >
                    {status}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Search size={30} />
          </div>

          <h3>
            {filter === "All"
              ? "No reports found"
              : `No ${filter.toLowerCase()} reports found`}
          </h3>

          <p>
            {filter === "All"
              ? "Create your first report to get started."
              : "Try another filter or report an item."}
          </p>

          <Link to="/report" className="button button-primary">
            Report an Item
          </Link>
        </div>
      )}
    </div>
  );
}

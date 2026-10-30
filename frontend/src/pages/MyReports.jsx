
// frontend/src/pages/MyReports.jsx

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus, Search } from "lucide-react";
import { getMyReports } from "../services/api";
import "../styles/pages.css";

export default function MyReports() {
  const [filter, setFilter] = useState("All");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  {report.imageUrl ? (
    <img
      src={`http://localhost:4000${report.imageUrl}`}
      alt={report.title}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "inherit",
      }}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  ) : (
    <FileText size={22} />
  )}
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

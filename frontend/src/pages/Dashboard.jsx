// frontend/src/pages/Dashboard.jsx

import { Link } from "react-router-dom";
import {
  Package,
  Search,
  Sparkles,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  MapPin,
  CalendarDays,
  Smartphone,
  Wallet,
  KeyRound,
  FileText,
} from "lucide-react";

import "../styles/pages.css";

const stats = [
  {
    label: "Total Reports",
    value: "128",
    description: "All submitted reports",
    icon: Package,
    color: "indigo",
  },
  {
    label: "Lost Items",
    value: "64",
    description: "Items reported missing",
    icon: Search,
    color: "orange",
  },
  {
    label: "Found Items",
    value: "64",
    description: "Items reported found",
    icon: CheckCircle2,
    color: "green",
  },
  {
    label: "Potential Matches",
    value: "18",
    description: "Matches to review",
    icon: Sparkles,
    color: "violet",
  },
];

const recentReports = [
  {
    id: 1,
    name: "Black Smartphone",
    category: "Electronics",
    type: "Lost",
    location: "College Library",
    date: "Oct 28, 2026",
    status: "Searching",
    icon: Smartphone,
  },
  {
    id: 2,
    name: "Brown Leather Wallet",
    category: "Accessories",
    type: "Found",
    location: "Main Cafeteria",
    date: "Oct 27, 2026",
    status: "Under Review",
    icon: Wallet,
  },
  {
    id: 3,
    name: "House Keys",
    category: "Personal Items",
    type: "Lost",
    location: "Parking Area",
    date: "Oct 26, 2026",
    status: "Searching",
    icon: KeyRound,
  },
];

const potentialMatches = [
  {
    id: 1,
    lostItem: "Black Smartphone",
    foundItem: "Dark Smartphone",
    category: "Electronics",
    score: 94,
    description: "Similar item descriptions and category",
  },
  {
    id: 2,
    lostItem: "Brown Leather Wallet",
    foundItem: "Leather Wallet",
    category: "Accessories",
    score: 87,
    description: "Similar color and item type",
  },
];

function Dashboard() {
  return (
    <div className="dashboard-page">
      {/* Welcome Section */}
      <section className="dashboard-welcome">
        <div>
          <span className="dashboard-greeting">YOUR FINDBACK OVERVIEW</span>

          <h1>
            Welcome back! <span>👋</span>
          </h1>

          <p>
            Here's an overview of lost and found activity.
            Let's help more belongings find their way home.
          </p>
        </div>

        <Link to="/report" className="button button-primary dashboard-report-btn">
          <Plus size={18} />
          Report an Item
        </Link>
      </section>

      {/* Statistics */}
      <section className="dashboard-stats">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <article className="dashboard-stat-card" key={stat.label}>
              <div className="dashboard-stat-top">
                <div className={`dashboard-stat-icon ${stat.color}`}>
                  <Icon size={22} />
                </div>

                <ArrowUpRight
                  size={18}
                  className="dashboard-stat-arrow"
                />
              </div>

              <p className="dashboard-stat-label">{stat.label}</p>

              <h2>{stat.value}</h2>

              <p className="dashboard-stat-description">
                {stat.description}
              </p>
            </article>
          );
        })}
      </section>

      {/* Quick Actions */}
      <section className="dashboard-quick-section">
        <div className="dashboard-section-heading">
          <div>
            <h2>Quick actions</h2>
            <p>What would you like to do today?</p>
          </div>
        </div>

        <div className="dashboard-quick-grid">
          <Link to="/report" className="dashboard-quick-card">
            <div className="dashboard-quick-icon indigo">
              <Plus size={22} />
            </div>

            <div>
              <h3>Report an item</h3>
              <p>Report something lost or found.</p>
            </div>

            <ArrowRight size={18} className="dashboard-quick-arrow" />
          </Link>

          <Link to="/browse" className="dashboard-quick-card">
            <div className="dashboard-quick-icon violet">
              <Search size={22} />
            </div>

            <div>
              <h3>Browse items</h3>
              <p>Explore existing reports.</p>
            </div>

            <ArrowRight size={18} className="dashboard-quick-arrow" />
          </Link>

          <Link to="/matches" className="dashboard-quick-card">
            <div className="dashboard-quick-icon lavender">
              <Sparkles size={22} />
            </div>

            <div>
              <h3>View AI matches</h3>
              <p>Review potentially matching items.</p>
            </div>

            <ArrowRight size={18} className="dashboard-quick-arrow" />
          </Link>
        </div>
      </section>

      {/* Recent Reports and Potential Matches */}
      <div className="dashboard-bottom-grid">
        <section className="dashboard-panel">
          <div className="dashboard-section-heading">
            <div>
              <h2>Recent reports</h2>
              <p>Latest activity across item reports.</p>
            </div>

            <Link to="/my-reports" className="dashboard-view-all">
              View all <ArrowRight size={15} />
            </Link>
          </div>

          <div className="dashboard-reports-list">
            {recentReports.map((report) => {
              const Icon = report.icon;

              return (
                <article className="dashboard-report-item" key={report.id}>
                  <div className="dashboard-report-icon">
                    <Icon size={21} />
                  </div>

                  <div className="dashboard-report-details">
                    <div className="dashboard-report-title-row">
                      <h3>{report.name}</h3>

                      <span
                        className={`dashboard-type-badge ${
                          report.type === "Lost" ? "lost" : "found"
                        }`}
                      >
                        {report.type}
                      </span>
                    </div>

                    <p>{report.category}</p>

                    <div className="dashboard-report-meta">
                      <span>
                        <MapPin size={13} />
                        {report.location}
                      </span>

                      <span>
                        <CalendarDays size={13} />
                        {report.date}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`dashboard-status ${
                      report.status === "Searching"
                        ? "searching"
                        : "review"
                    }`}
                  >
                    {report.status}
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="dashboard-panel dashboard-matches-panel">
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <Sparkles size={19} />
                Potential AI matches
              </h2>

              <p>Suggested matches to review.</p>
            </div>

            <Link to="/matches" className="dashboard-view-all">
              View all <ArrowRight size={15} />
            </Link>
          </div>

          <div className="dashboard-match-list">
            {potentialMatches.map((match) => (
              <article className="dashboard-match-card" key={match.id}>
                <div className="dashboard-match-top">
                  <span className="dashboard-match-category">
                    {match.category}
                  </span>

                  <span className="dashboard-match-score">
                    <Sparkles size={13} />
                    {match.score}% similarity
                  </span>
                </div>

                <div className="dashboard-match-items">
                  <div>
                    <span>LOST ITEM</span>
                    <h3>{match.lostItem}</h3>
                  </div>

                  <ArrowRight size={18} />

                  <div>
                    <span>FOUND ITEM</span>
                    <h3>{match.foundItem}</h3>
                  </div>
                </div>

                <p className="dashboard-match-description">
                  {match.description}
                </p>

                <Link to="/matches" className="dashboard-review-link">
                  Review match <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>

          <div className="dashboard-ai-note">
            <Sparkles size={17} />

            <p>
              Similarity scores are suggestions, not proof of ownership.
              Verify details before approving a claim.
            </p>
          </div>
        </section>
      </div>

      {/* Helpful reminder */}
      <section className="dashboard-help-banner">
        <div className="dashboard-help-icon">
          <FileText size={23} />
        </div>

        <div>
          <h3>Help us make a better match</h3>
          <p>
            Include accurate descriptions, locations, dates, and photos
            when reporting an item.
          </p>
        </div>

        <Link to="/report" className="dashboard-help-link">
          Create a report <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

export default Dashboard;
import { Link } from "react-router-dom";
import {
  Users,
  PackageSearch,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import "../styles/pages.css";

const adminStats = [
  { label: "Total Users", value: "0", icon: Users },
  { label: "Item Reports", value: "0", icon: PackageSearch },
  { label: "Claims to Review", value: "0", icon: ShieldCheck },
  { label: "Flagged Reports", value: "0", icon: AlertTriangle },
];

export default function AdminDashboard() {
  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">SYSTEM MANAGEMENT</span>
          <h1>Admin Dashboard</h1>
          <p>Monitor reports and manage the ownership verification workflow.</p>
        </div>

        <span className="admin-label">Administrator Area</span>
      </div>

      <div className="stats-grid">
        {adminStats.map((stat) => {
          const Icon = stat.icon;

          return (
            <article className="stat-card" key={stat.label}>
              <div className="stat-icon"><Icon size={22} /></div>
              <p>{stat.label}</p>
              <h2>{stat.value}</h2>
            </article>
          );
        })}
      </div>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <h2>Administrative Actions</h2>
            <p>Common tasks for managing the lost and found system.</p>
          </div>

          <ClipboardCheck size={21} />
        </div>

        <div className="admin-actions-grid">
          <article className="admin-action-card">
            <div className="feature-icon"><ShieldCheck size={22} /></div>
            <h3>Review Claims</h3>
            <p>Examine submitted ownership claims and supporting details.</p>
            <Link to="/claims" className="text-link">
              View Claims <ArrowRight size={16} />
            </Link>
          </article>

          <article className="admin-action-card">
            <div className="feature-icon"><PackageSearch size={22} /></div>
            <h3>Review Item Reports</h3>
            <p>Browse reports and identify records requiring attention.</p>
            <Link to="/browse" className="text-link">
              Browse Items <ArrowRight size={16} />
            </Link>
          </article>
        </div>
      </section>

      <div className="admin-warning">
        <AlertTriangle size={20} />
        <p>
          <strong>Development placeholder:</strong> Real administration
          requires backend-enforced administrator permissions. Hiding a
          page or checking a browser token alone does not provide security.
        </p>
      </div>
    </div>
  );
}
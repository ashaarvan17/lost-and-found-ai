import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  FilePlus2,
  ClipboardList,
  Sparkles,
  ShieldCheck,
  KeyRound,
  X,
  UserCog,
  ClipboardCheck,
  Users,
} from "lucide-react";
import "./components.css";

const menuItems = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Browse Items",
    path: "/browse",
    icon: Search,
  },
  {
    label: "Report an Item",
    path: "/report",
    icon: FilePlus2,
  },
  {
    label: "My Reports",
    path: "/my-reports",
    icon: ClipboardList,
  },
  {
    label: "AI Matches",
    path: "/matches",
    icon: Sparkles,
  },
  {
    label: "My Claims",
    path: "/claims",
    icon: ShieldCheck,
  },
];

export default function Sidebar({ open = true, onClose, user }) {
  const roleItems = [
    ...(user?.isLocalAdmin ? [{ label: "Local Admin Tasks", path: "/recovery/tasks", icon: KeyRound }] : []),
    ...(user?.role === "admin" ? [
      { label: "Super Admin", path: "/admin", icon: UserCog },
      { label: "Claim Review", path: "/admin/review", icon: ShieldCheck },
      { label: "Local Admin applications", path: "/admin/local-admin-applications", icon: ClipboardCheck },
      { label: "Area assignments", path: "/admin/local-admins", icon: Users },
    ] : []),
  ];
  const visibleItems = [...menuItems, ...roleItems];
  return (
    <>
      {open && (
        <button
          className="sidebar-overlay"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-icon">
              <Search size={21} />
            </span>

            <span className="brand-text">
              Find<span className="brand-accent">Back</span>
            </span>
          </div>

          <button
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X size={21} />
          </button>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          {visibleItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
                }
                onClick={onClose}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-ai-card">
            <div className="sidebar-ai-icon">
              <Sparkles size={18} />
            </div>

            <h4>Powered by AI</h4>

            <p>
              Discover potential matches between lost and found items.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

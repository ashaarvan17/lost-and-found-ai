
// frontend/src/layouts/DashboardLayout.jsx

import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import {
  Menu,
  Bell,
  UserRound,
  Search,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import "./layouts.css";

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main dashboard area */}
      <div className="dashboard-main">
        {/* Dashboard header */}
        <header className="dashboard-header">
          <div className="dashboard-header-left">
            <button
              type="button"
              className="dashboard-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
            >
              <Menu size={22} />
            </button>

            <div className="dashboard-search">
              <Search size={18} />

              <input
                type="search"
                placeholder="Search items, reports..."
                aria-label="Search items and reports"
              />

              <span className="search-shortcut">Search</span>
            </div>
          </div>

          <div className="dashboard-header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell size={20} />
              <span className="notification-dot" />
            </button>

            <Link
              to="/settings"
              className="dashboard-profile"
              aria-label="Open profile settings"
            >
              <span className="profile-avatar">
                <UserRound size={20} />
              </span>

              <span className="profile-info">
                <strong>My Account</strong>
                <small>Member</small>
              </span>
            </Link>
          </div>
        </header>

        {/* Current dashboard page */}
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

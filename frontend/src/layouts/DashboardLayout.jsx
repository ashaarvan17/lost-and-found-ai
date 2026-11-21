
// frontend/src/layouts/DashboardLayout.jsx

import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  Menu,
  UserRound,
  Search,
  LogOut,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import { getCurrentUser, logoutUser } from "../services/api";
import "./layouts.css";

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user: current }) => {
      if (active) { setUser(current); localStorage.setItem("user", JSON.stringify(current)); }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function signOut() {
    logoutUser();
    navigate("/login", { replace: true });
  }

  function searchItems(event) {
    event.preventDefault();
    navigate(`/browse${searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : ""}`);
  }

  const accountLabel = user?.role === "admin" ? "Super Admin" : user?.isLocalAdmin ? "Local Admin" : user?.accountStatus === "local_admin_approved" ? "Approved · awaiting area" : "Member";

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
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

            <form className="dashboard-search" onSubmit={searchItems}>
              <Search size={18} />

              <input
                type="search"
                placeholder="Search items, reports..."
                aria-label="Search items and reports"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />

              <button type="submit" className="search-shortcut">Search</button>
            </form>
          </div>

          <div className="dashboard-header-actions">
            <div className="dashboard-profile">
              <span className="profile-avatar">
                <UserRound size={20} />
              </span>

              <span className="profile-info">
                <strong>{user?.name || "My Account"}</strong>
                <small>{accountLabel}</small>
              </span>
            </div>
            <button type="button" className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
          </div>
        </header>

        {/* Current dashboard page */}
        <main className="dashboard-content">
          <Outlet context={{ user, accountLabel }} />
        </main>
      </div>
    </div>
  );
}

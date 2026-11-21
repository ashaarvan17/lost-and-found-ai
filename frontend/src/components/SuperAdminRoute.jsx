import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getCurrentUser } from "../services/api";

export default function SuperAdminRoute() {
  const [access, setAccess] = useState("checking");
  useEffect(() => {
    let active = true;
    getCurrentUser().then(({ user }) => {
      if (!active) return;
      localStorage.setItem("user", JSON.stringify(user));
      setAccess(user.role === "admin" ? "allowed" : "denied");
    }).catch((error) => {
      if (active) setAccess(error.status === 403 ? "denied" : "error");
    });
    return () => { active = false; };
  }, []);
  if (access === "checking") return <div className="route-loading" role="status">Checking administrative access…</div>;
  if (access === "denied") return <Navigate to="/dashboard" replace />;
  if (access === "error") return <main className="route-loading" role="alert">Unable to verify administrative access. Reload and try again.</main>;
  return <Outlet />;
}

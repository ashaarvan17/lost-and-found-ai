import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getCurrentUser } from "../services/api";

export default function ProtectedRoute() {
  const location = useLocation();
  const [status, setStatus] = useState("checking");

  // This improves navigation UX only; protected API routes still enforce auth.
  const token = localStorage.getItem("token");

  useEffect(() => {
    let active = true;
    if (!token) return () => { active = false; };
    getCurrentUser()
      .then(({ user }) => {
        if (!active) return;
        localStorage.setItem("user", JSON.stringify(user));
        setStatus("authenticated");
      })
      .catch((error) => {
        if (!active) return;
        if ([401, 403].includes(error.status)) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setStatus("signed-out");
        } else {
          setStatus("error");
        }
      });
    return () => { active = false; };
  }, [token]);

  if (!token || status === "signed-out") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (status === "error") return <div className="route-loading" role="alert">Unable to verify your session. Check your connection and reload this page.</div>;
  if (status !== "authenticated") return <div className="route-loading" role="status">Checking your secure session…</div>;

  return <Outlet />;
}

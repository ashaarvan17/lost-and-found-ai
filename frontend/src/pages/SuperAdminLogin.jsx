import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { getCurrentUser, loginSuperAdmin } from "../services/api";
import "../styles/pages.css";

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("SuperAdmin@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) return undefined;
    let active = true;
    getCurrentUser().then(({ user }) => {
      if (active && user.role === "admin") navigate("/admin", { replace: true });
    }).catch(() => {});
    return () => { active = false; };
  }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your Super Admin email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loginSuperAdmin({ email: email.trim(), password });
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign in. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="auth-page super-admin-login-page">
    <section className="auth-card super-admin-login-card">
      <Link to="/" className="auth-brand"><span className="auth-brand-icon"><KeyRound size={22} /></span><span>FindBack<span className="brand-accent"> AI</span></span></Link>
      <div className="auth-heading">
        <span className="eyebrow">RESTRICTED ADMIN ACCESS</span>
        <h1>Super Admin sign in</h1>
        <p>Sign in to manage reports, applications, and area assignments.</p>
      </div>
      <div className="auth-approval-notice super-admin-login-notice"><ShieldCheck size={18} /><span>This access is limited to the provisioned Super Admin account.</span></div>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="super-admin-email">Email address</label>
        <div className="auth-input-wrapper"><Mail size={18} /><input id="super-admin-email" type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required disabled={loading} /></div>
        <label htmlFor="super-admin-password">Password</label>
        <div className="auth-input-wrapper"><LockKeyhole size={18} /><input id="super-admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} required disabled={loading} /></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary auth-submit" disabled={loading}>{loading ? "Verifying access…" : "Sign in as Super Admin"}{!loading && <ArrowRight size={17} />}</button>
      </form>
      <p className="auth-switch"><Link to="/login">Return to regular sign in</Link></p>
    </section>
  </div>;
}

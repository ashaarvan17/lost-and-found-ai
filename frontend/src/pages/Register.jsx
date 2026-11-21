
// frontend/src/pages/Register.jsx

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  UserRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";

import { registerUser, submitLocalAdminApplication } from "../services/api";
import "../styles/pages.css";

export default function Register() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registrationType, setRegistrationType] = useState("user");
  const [application, setApplication] = useState(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    requestedArea: "",
    verificationDetails: "",
  });

  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (formData.fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!formData.email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (formData.password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const credentials = {
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
      };

      if (registrationType === "local-admin") {
        const result = await submitLocalAdminApplication({
          ...credentials,
          requestedArea: formData.requestedArea.trim(),
          phone: formData.phone.trim(),
          verificationDetails: formData.verificationDetails.trim(),
        });
        setApplication(result.data);
        return;
      }

      await registerUser(credentials);

      // Registration succeeded. Navigate to login.
      navigate("/login", {
        replace: true,
        state: {
          message: "Account created successfully! Please sign in.",
          email: formData.email.trim(),
        },
      });
    } catch (err) {
      setError(
        err.message ||
          "Unable to create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page-register">
      <div className="auth-card">
        <Link to="/" className="auth-brand">
          <span className="auth-brand-icon">
            <Search size={24} />
          </span>

          <span>
            FindBack<span className="brand-accent"> AI</span>
          </span>
        </Link>

        {application ? (
          <section className="application-confirmation" role="status">
            <span className="eyebrow">APPLICATION RECEIVED</span>
            <h1>Thanks, {formData.fullName.trim().split(/\s+/)[0]}.</h1>
            <p>Your Local Admin application for <strong>{application.requestedArea}</strong> is pending Super Admin review.</p>
            <p>Approval and a separate area assignment are both required before recovery tasks become available.</p>
            <Link className="button button-primary auth-submit" to="/login">Continue to sign in</Link>
          </section>
        ) : <>
        <div className="auth-heading">
          <span className="eyebrow">JOIN FINDBACK AI</span>

          <h1>Create your account</h1>

          <p>
            Choose how you want to use FindBack AI.
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Registration type">
          <button type="button" role="tab" aria-selected={registrationType === "user"} className={registrationType === "user" ? "auth-tab auth-tab-active" : "auth-tab"} onClick={() => { setRegistrationType("user"); setError(""); }}>Regular account</button>
          <button type="button" role="tab" aria-selected={registrationType === "local-admin"} className={registrationType === "local-admin" ? "auth-tab auth-tab-active" : "auth-tab"} onClick={() => { setRegistrationType("local-admin"); setError(""); }}>Local Admin application</button>
        </div>

        {registrationType === "local-admin" && <p className="auth-approval-notice">Local Admin access requires approval from the Super Admin. Your application remains pending until it has been reviewed and approved. A separate area assignment is also required.</p>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="fullName">Full name</label>

          <div className="auth-input-wrapper">
            <UserRound size={18} />

            <input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="Enter your full name"
              value={formData.fullName}
              onChange={handleChange}
              autoComplete="name"
              minLength={2}
              required
              disabled={loading}
            />
          </div>

          {registrationType === "local-admin" && <>
            <label htmlFor="requestedArea">Requested operating area</label>
            <div className="auth-input-wrapper"><Search size={18} /><input id="requestedArea" name="requestedArea" type="text" placeholder="City, campus, or neighborhood" value={formData.requestedArea} onChange={handleChange} maxLength={200} required disabled={loading} /></div>
            <label htmlFor="phone">Phone (optional)</label>
            <div className="auth-input-wrapper"><Mail size={18} /><input id="phone" name="phone" type="tel" placeholder="For application follow-up" value={formData.phone} onChange={handleChange} maxLength={40} autoComplete="tel" disabled={loading} /></div>
            <label htmlFor="verificationDetails">Additional details (optional)</label>
            <textarea className="auth-textarea" id="verificationDetails" name="verificationDetails" placeholder="Share relevant experience or availability. Do not include sensitive identity documents." value={formData.verificationDetails} onChange={handleChange} maxLength={500} disabled={loading} />
          </>}

          <label htmlFor="email">Email address</label>

          <div className="auth-input-wrapper">
            <Mail size={18} />

            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <label htmlFor="password">Password</label>

          <div className="auth-input-wrapper">
            <Lock size={18} />

            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={loading}
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() =>
                setShowPassword((previousValue) => !previousValue)
              }
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
              disabled={loading}
            >
              {showPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>

          <label htmlFor="confirmPassword">Confirm password</label>

          <div className="auth-input-wrapper">
            <Lock size={18} />

            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="button button-primary auth-submit"
            disabled={loading}
          >
            {loading ? "Submitting..." : registrationType === "user" ? "Create Account" : "Submit application"}

            {!loading && <ArrowRight size={17} />}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </p>
        </>}
      </div>
    </div>
  );
}

// frontend/src/pages/Landing.jsx

import { Link } from "react-router-dom";
import {
  Search,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  PackageSearch,
  HeartHandshake,
  CheckCircle2,
  BellRing,
  ClipboardCheck,
  ScanSearch,
} from "lucide-react";
import "../styles/pages.css";

export default function Landing() {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <span className="eyebrow">
            <Sparkles size={16} />
            AI-POWERED LOST & FOUND
          </span>

          <h1>
            Lost something?
            <br />
            <span>Let's find it together.</span>
          </h1>

          <p>
            Report lost belongings, discover found items, and use
            AI-powered matching to identify potential matches faster.
          </p>

          <div className="hero-actions">
            <Link to="/report" className="button button-primary">
              Report an Item <ArrowRight size={17} />
            </Link>

            <Link to="/browse" className="button button-secondary">
              <Search size={17} /> Find an Item
            </Link>
          </div>

          <div className="hero-trust">
            <span>
              <ShieldCheck size={17} /> Privacy-conscious reporting
            </span>
            <span>
              <Sparkles size={17} /> AI-assisted matching
            </span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-visual-glow" />

          <div className="hero-illustration-card">
            <div className="hero-illustration-icon">
              <PackageSearch size={66} strokeWidth={1.3} />
            </div>

            <span className="ai-pill">
              <Sparkles size={14} /> AI matching assistant
            </span>

            <h3>Every item has a way back.</h3>

            <p>
              Connect lost reports with potentially matching found items.
            </p>

            <div className="illustration-progress">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="floating-badge">
            <CheckCircle2 size={18} />

            <div>
              <strong>Potential match</strong>
              <small>Review the matching details</small>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="page-section" id="how-it-works">
        <div className="section-heading">
          <span className="eyebrow">HOW IT WORKS</span>

          <h2>A simpler way to reunite with your belongings</h2>

          <p>Three steps bring lost and found reports together.</p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">
              <PackageSearch size={24} />
            </div>

            <span className="step-number">STEP 01</span>

            <h3>Report an item</h3>

            <p>
              Submit details about a lost or found item, including its
              description, category, date, location, and photos.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">
              <Sparkles size={24} />
            </div>

            <span className="step-number">STEP 02</span>

            <h3>Discover potential matches</h3>

            <p>
              AI analyzes available item information to identify reports
              that may describe the same belongings.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">
              <HeartHandshake size={24} />
            </div>

            <span className="step-number">STEP 03</span>

            <h3>Verify and reclaim</h3>

            <p>
              Review a potential match, submit a claim, and complete the
              ownership verification process.
            </p>
          </article>
        </div>
      </section>

      {/* Key Features */}
      <section className="page-section key-features" id="features">
        <div className="section-heading">
          <span className="eyebrow">WHY FINDBACK AI?</span>

          <h2>More than a lost and found listing</h2>

          <p>
            Intelligent matching and a structured recovery process help
            people reconnect with their belongings.
          </p>
        </div>

        <div className="key-features-grid">
          <article className="key-feature-card">
            <div className="key-feature-icon">
              <ScanSearch size={25} />
            </div>

            <h3>AI-powered matching</h3>

            <p>
              Compare item descriptions and available details to surface
              potentially relevant lost and found reports.
            </p>
          </article>

          <article className="key-feature-card">
            <div className="key-feature-icon">
              <ShieldCheck size={25} />
            </div>

            <h3>Privacy-conscious reporting</h3>

            <p>
              Organize reports while limiting unnecessary exposure of
              sensitive information.
            </p>
          </article>

          <article className="key-feature-card">
            <div className="key-feature-icon">
              <ClipboardCheck size={25} />
            </div>

            <h3>Claim verification</h3>

            <p>
              Submit a claim and follow a separate verification process
              before an item is returned.
            </p>
          </article>

          <article className="key-feature-card">
            <div className="key-feature-icon">
              <BellRing size={25} />
            </div>

            <h3>Match notifications</h3>

            <p>
              Receive notifications about relevant potential matches
              when the notification functionality is implemented.
            </p>
          </article>
        </div>
      </section>

      {/* Call to Action */}
      <section className="landing-cta">
        <div>
          <span className="eyebrow">START HERE</span>

          <h2>Help a lost item find its way home.</h2>

          <p>
            Every useful report creates another opportunity for a match.
          </p>
        </div>

        <Link to="/register" className="button button-primary">
          Get Started <ArrowRight size={17} />
        </Link>
      </section>
    </div>
  );
}
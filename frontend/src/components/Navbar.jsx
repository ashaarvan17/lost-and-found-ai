//frontend/src/components/Navbar.jsx

import { Link, NavLink } from "react-router-dom";
import { Search, Menu, X, Sparkles } from "lucide-react";
import { useState } from "react";
import "./navbar.css";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Logo */}
        <Link to="/" className="brand" onClick={closeMenu}>
          <span className="brand-icon">
            <Search size={23} />
          </span>

          <span className="brand-text">
            Find<span className="brand-accent">Back</span>
            <span className="brand-ai">
              <Sparkles size={12} /> AI
            </span>
          </span>
        </Link>

        {/* Mobile menu button */}
        <button
          className="mobile-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Navigation */}
        <nav className={`navbar-menu ${menuOpen ? "navbar-menu-open" : ""}`}>
          <NavLink to="/" className="nav-link" onClick={closeMenu}>
            Home
          </NavLink>

          <NavLink to="/browse" className="nav-link" onClick={closeMenu}>
            Browse Items
          </NavLink>

          <a href="/#how-it-works" className="nav-link" onClick={closeMenu}>
            How It Works
          </a>

          <div className="navbar-actions">
            <Link
              to="/login"
              className="button button-secondary"
              onClick={closeMenu}
            >
              Log In
            </Link>

            <Link
              to="/register"
              className="button button-primary"
              onClick={closeMenu}
            >
              Get Started
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
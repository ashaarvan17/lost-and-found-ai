
import { useState, useEffect } from "react";
import {
  Sparkles,
  Search,
  RefreshCw,
} from "lucide-react";

import MatchCard from "../components/MatchCard";
import "../styles/pages.css";
import { getMyMatches } from "../services/api";

export default function Matches() {
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMatches = async () => {
    try {
      setLoading(true);
      setError("");

      // Get the JWT token saved during login.
      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Please log in to view your matches.");
      }

      setMatches(await getMyMatches());
    } catch (err) {
      console.error("Error fetching matches:", err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await getMyMatches();
        if (active) { setMatches(rows); setError(""); }
      } catch (err) {
        if (active) setError(err.message || "Something went wrong.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const query = search.trim().toLowerCase();

  const filteredMatches = matches.filter((match) => {
    const lostReport = match.lostReport || {};

    const searchableValues = [
      lostReport.title,
      lostReport.category,
    ];

    return searchableValues.some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">
            INTELLIGENT DISCOVERY
          </span>

          <h1>AI Potential Matches</h1>

          <p>
            See private indications for your lost reports that may have a
            match.
          </p>
        </div>

        <span className="ai-pill">
          <Sparkles size={15} /> AI-Assisted
        </span>
      </div>

      <div className="ai-info-banner">
        <div className="ai-banner-icon">
          <Sparkles size={22} />
        </div>

        <div>
          <h3>How matching works</h3>

          <p>
            A possible match only indicates that a private found report may
            describe your item. Its description, image, and finder details
            stay hidden while ownership verification is unavailable. A match
            does not confirm ownership.
          </p>
        </div>
      </div>

      <div className="browse-toolbar">
        <div className="browse-search">
          <Search size={19} />

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search your lost reports..."
            aria-label="Search your lost reports"
          />
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setSearch("");
            fetchMatches();
          }}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh Matches
        </button>
      </div>

      <div className="match-list">
        {loading ? (
          <div className="empty-state">
            <h3>Finding potential matches...</h3>
            <p>Please wait while we analyze your reports.</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h3>Unable to load matches</h3>
            <p>{error}</p>

            <button
              type="button"
              className="button button-primary"
              onClick={fetchMatches}
            >
              Try Again
            </button>
          </div>
        ) : filteredMatches.length > 0 ? (
          filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
            />
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Sparkles size={30} />
            </div>

            <h3>
              {matches.length === 0
                ? "No possible matches yet"
                : "No matching lost reports found"}
            </h3>

            <p>
              {matches.length === 0
                ? "A private indication will appear if a found report may match one of your lost reports."
                : "Try a different search term."}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

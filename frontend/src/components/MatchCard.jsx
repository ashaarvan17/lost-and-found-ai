import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import "./components.css";

export default function MatchCard({ match }) {
  if (!match) return null;

  return (
    <article className="match-card">
      <div className="match-card-header">
        <span className="ai-match-label">
          <Sparkles size={15} />
          Possible match
        </span>
      </div>

      <div className="match-items">
        <div className="match-item">
          <div className="match-item-label">YOUR LOST REPORT</div>
          <h3>{match.lostReport?.title || "Your lost item"}</h3>
          <p>{match.lostReport?.category || "Category unavailable"}</p>
        </div>
        <div className="match-connector" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div className="match-item match-private-indication">
          <div className="match-item-label">PRIVATE FOUND REPORT</div>
          <ShieldCheck size={25} aria-hidden="true" />
          <p>A found report may match. Its details are kept private.</p>
        </div>
      </div>

      <div className="match-card-footer">
        <p>A possible match does not confirm ownership.</p>
        <Link
          to={`/matches/${encodeURIComponent(String(match.id))}`}
          className="button button-primary match-view-button"
        >
          View status
          <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

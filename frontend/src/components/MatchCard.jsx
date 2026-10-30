import {
  Sparkles,
  MapPin,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import "./components.css";

export default function MatchCard({ match }) {
  if (!match) return null;

  const {
    id,
    lostItem,
    foundItem,
    similarityScore,
    matchingAttributes = [],
  } = match;

  const score = Number(similarityScore);
  const validScore = Number.isFinite(score) && score >= 0 && score <= 100;

  return (
    <article className="match-card">
      <div className="match-card-header">
        <span className="ai-match-label">
          <Sparkles size={15} />
          AI Potential Match
        </span>

        {validScore && (
          <div className="match-score">
            <span className="match-score-value">{score}%</span>
            <span className="match-score-label">Similarity</span>
          </div>
        )}
      </div>

      <div className="match-items">
        <div className="match-item">
          <div className="match-item-label">LOST ITEM</div>

          <h3>{lostItem?.title || "Lost item"}</h3>

          <p>
            {lostItem?.category || "Category unavailable"}
          </p>

          <span className="match-location">
            <MapPin size={14} />
            {lostItem?.location || "Location unavailable"}
          </span>
        </div>

        <div className="match-connector">
          <div className="match-connector-icon">
            <Sparkles size={18} />
          </div>
        </div>

        <div className="match-item">
          <div className="match-item-label">FOUND ITEM</div>

          <h3>{foundItem?.title || "Found item"}</h3>

          <p>
            {foundItem?.category || "Category unavailable"}
          </p>

          <span className="match-location">
            <MapPin size={14} />
            {foundItem?.location || "Location unavailable"}
          </span>
        </div>
      </div>

      {matchingAttributes.length > 0 && (
        <div className="matching-attributes">
          <h4>
            <CheckCircle2 size={16} />
            Matching Attributes
          </h4>

          <div className="attribute-list">
            {matchingAttributes.map((attribute, index) => (
              <span className="attribute-tag" key={`${attribute}-${index}`}>
                {attribute}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="match-card-footer">
        <p>
          Similarity scores indicate how closely the reports match. They do
          not prove ownership.
        </p>

        <Link
          to={`/matches/${encodeURIComponent(String(id))}`}
          className="button button-primary match-view-button"
        >
          Review Match
          <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
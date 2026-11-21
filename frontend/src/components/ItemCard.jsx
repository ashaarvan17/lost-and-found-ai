
import { useState } from "react";
import { MapPin, CalendarDays, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { resolveImageUrl } from "../services/api";
import "./components.css";

export default function ItemCard({ item }) {
  const [imageError, setImageError] = useState(false);

  if (!item) return null;

  const {
    id,
    title = "Untitled Item",
    category = "Uncategorized",
    location = "Location unavailable",
    date = "Date unavailable",
    status = "Lost",
    image = "",
  } = item;

  const isFound = String(status).toLowerCase() === "found";
  const isResolved = String(status).toLowerCase() === "resolved";

  return (
    <article className="item-card">
      <div className="item-image-wrapper">
        {image && !imageError ? (
          <img
            src={resolveImageUrl(image)}
            alt={title}
            className="item-image"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="item-image-placeholder">
            <span>{category}</span>
          </div>
        )}

        <span
          className={`status-badge ${
            isResolved ? "status-resolved" : isFound ? "status-found" : "status-lost"
          }`}
        >
          {status}
        </span>
      </div>

      <div className="item-card-content">
        <div className="item-card-category">{category}</div>

        <h3 className="item-card-title">{title}</h3>

        <div className="item-card-details">
          <span>
            <MapPin size={15} />
            {location}
          </span>

          <span>
            <CalendarDays size={15} />
            {date}
          </span>
        </div>

        <Link
          to={`/items/${encodeURIComponent(String(id ?? ""))}`}
          className="item-card-link"
          aria-label={`View details for ${title}`}
        >
          View Details
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </article>
  );
}

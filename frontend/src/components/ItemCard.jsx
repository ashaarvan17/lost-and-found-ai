import { MapPin, CalendarDays, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./components.css";

export default function ItemCard({ item }) {
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

  return (
    <article className="item-card">
      <div className="item-image-wrapper">
        {image ? (
          <img
            src={image}
            alt={title}
            className="item-image"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="item-image-placeholder">
            <span>{category}</span>
          </div>
        )}

        <span
          className={`status-badge ${
            isFound ? "status-found" : "status-lost"
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
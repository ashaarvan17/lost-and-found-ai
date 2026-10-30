import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  CalendarDays,
  Package,
  Tag,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";

import { getReportById } from "../services/api";
import "../styles/pages.css";

export default function ItemDetails() {
  const { id } = useParams();

  const [item, setItem] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadItem() {
      try {
        setIsLoading(true);
        setError("");

        const report = await getReportById(id);

        if (isMounted) {
          setItem(report);
        }
      } catch (err) {
        console.error("Failed to load item details:", err);

        if (isMounted) {
          setError(
            err.message || "Unable to load item details."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadItem();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <LoaderCircle size={30} />
          <h3>Loading item details...</h3>
          <p>Please wait while we fetch the report.</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="page-container">
        <Link to="/browse" className="back-link">
          <ArrowLeft size={17} />
          Back to Browse Items
        </Link>

        <div className="empty-state" role="alert">
          <AlertCircle size={30} />
          <h3>Item not found</h3>
          <p>{error || "This report could not be found."}</p>
        </div>
      </div>
    );
  }

  const isFound = item.type?.toLowerCase() === "found";

  const formattedDate = item.date
    ? new Date(item.date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Date unavailable";

  return (
    <div className="page-container">
      <Link to="/browse" className="back-link">
        <ArrowLeft size={17} />
        Back to Browse Items
      </Link>

      <div className="page-heading">
        <span className="eyebrow">ITEM DETAILS</span>
        <h1>{item.title}</h1>
        <p>View the information provided in this lost or found report.</p>
      </div>

      <div className="content-panel">
       
<div className="item-image-wrapper">
  {item.imageUrl ? (
    <img
  src={
    item.imageUrl?.startsWith("http")
      ? item.imageUrl
      : `http://localhost:4000${item.imageUrl?.startsWith("/") ? "" : "/"}${item.imageUrl}`
  }
  alt={item.title}
  className="item-image"
/>
  ) : (
    <div className="item-image-placeholder">
      <Package size={42} />
      <span>{item.category || "Item"}</span>
    </div>
  )}

          

          <span
            className={`status-badge ${
              isFound ? "status-found" : "status-lost"
            }`}
          >
            {item.type || "Unknown"}
          </span>
        </div>

        <div className="item-card-content">
          <div className="item-card-category">
            {item.category || "Uncategorized"}
          </div>

          <h2>{item.title}</h2>

          <p>{item.description || "No description provided."}</p>

          <div className="item-card-details">
            <span>
              <MapPin size={17} />
              {item.location || "Location unavailable"}
            </span>

            <span>
              <CalendarDays size={17} />
              {formattedDate}
            </span>

            <span>
              <Tag size={17} />
              {item.category || "Uncategorized"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
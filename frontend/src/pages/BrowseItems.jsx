// frontend/src/pages/BrowseItems.jsx

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, PackageSearch } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import ItemCard from "../components/ItemCard";
import { getAllReports } from "../services/api";
import "../styles/pages.css";

export default function BrowseItems() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [status, setStatus] = useState("All");

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch reports from the backend when the page loads.
  useEffect(() => {
    async function loadReports() {
      try {
        setIsLoading(true);
        setError("");

        const reports = await getAllReports();

        // Found reports remain private; active and resolved lost reports are public.
        const formattedItems = reports
          .filter((report) => report.type === "lost" && ["active", "resolved"].includes(report.status))
          .map((report) => ({
            id: report._id,
            kind: "Lost",
            title: report.title,
            category: report.category,
            location: report.location,
            date: report.date
              ? new Date(report.date).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Date unavailable",
            status: report.status === "resolved" ? "Resolved" : "Lost",
            description: report.description,
            image: report.imageUrl || "",
          }));

        setItems(formattedItems);
      } catch (err) {
        console.error("Failed to load reports:", err);

        setError(
          err.message || "Unable to load reports. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadReports();
  }, []);

  // Search and filter the reports.
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch = [
        item.title,
        item.category,
        item.location,
        item.description || "",
      ].some((value) =>
        String(value).toLowerCase().includes(query)
      );

      const matchesStatus =
        status === "All" || item.kind === status;

      return matchesSearch && matchesStatus;
    });
  }, [items, search, status]);

  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">ITEM DIRECTORY</span>
          <h1>Browse Items</h1>
          <p>
            Search reported items to find something that belongs to you.
          </p>
        </div>
      </div>

      <div className="browse-toolbar">
        <div className="browse-search">
          <Search size={19} />

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by item, category, or location..."
            aria-label="Search reported items"
          />
        </div>

        <div className="browse-filter">
          <SlidersHorizontal size={17} />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter items by status"
          >
            <option value="All">All Items</option>
            <option value="Lost">Lost Items</option>
          </select>
        </div>
      </div>

      <div className="browse-results-heading">
        <h2>Reported Items</h2>

        <span>
          {isLoading ? "Loading..." : `${filteredItems.length} items`}
        </span>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <h3>Loading reports...</h3>
          <p>Please wait while we fetch the latest reports.</p>
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <div className="empty-state-icon">
            <PackageSearch size={30} />
          </div>

          <h3>Unable to load reports</h3>
          <p>{error}</p>
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="item-grid">
          {filteredItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <PackageSearch size={30} />
          </div>

          <h3>No items found</h3>

          <p>
            {items.length === 0
              ? "No reports have been submitted yet."
              : "Try a different search term or change the selected filter."}
          </p>
        </div>
      )}
    </div>
  );
}

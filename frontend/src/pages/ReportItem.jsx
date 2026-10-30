//frontend/src/pages/ReportItem.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  MapPin,
  CalendarDays,
  Package,
} from "lucide-react";
import { createReport } from "../services/api";
import "../styles/pages.css";

const initialForm = {
  reportType: "Lost",
  title: "",
  category: "",
  description: "",
  location: "",
  date: "",
};

export default function ReportItem() {
  const [form, setForm] = useState(initialForm);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setMessageType("");

    try {
      setIsSubmitting(true);

      // Convert the form values to the format expected by the backend.
      const reportData = {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.reportType.toLowerCase(),
        category: form.category,
        location: form.location.trim(),
        date: form.date,
        imageUrl: "",
      };

      // Send the report to Express, which saves it in MongoDB.
      await createReport(reportData, image);

      setMessage("Your report has been submitted successfully!");
      setMessageType("success");

      // Reset the form after successful submission.
      setForm(initialForm);
      setImage(null);

      // Clear the file input after submission.
      const fileInput = document.getElementById("item-photo");

      if (fileInput) {
        fileInput.value = "";
      }
    } catch (error) {
      console.error("Report submission failed:", error);

      setMessage(
        error.message ||
          "Unable to submit your report. Please try again."
      );

      setMessageType("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClearForm() {
    setForm(initialForm);
    setImage(null);
    setMessage("");
    setMessageType("");

    const fileInput = document.getElementById("item-photo");

    if (fileInput) {
      fileInput.value = "";
    }
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setImage(null);
      setMessage("Please select a PNG, JPG, or WEBP image.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImage(null);
      setMessage("Image must be 5 MB or smaller.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    setImage(file);
    setMessage("");
    setMessageType("");
  }

  return (
    <div className="page-container form-page">
      <Link to="/dashboard" className="back-link">
        <ArrowLeft size={17} /> Back to Dashboard
      </Link>

      <div className="page-heading">
        <span className="eyebrow">COMMUNITY REPORTING</span>
        <h1>Report an Item</h1>
        <p>
          Share clear and accurate details to help identify potential matches.
        </p>
      </div>

      <form
        className="content-panel report-form"
        onSubmit={handleSubmit}
      >
        <div className="form-section-heading">
          <div className="feature-icon">
            <Package size={21} />
          </div>

          <div>
            <h2>Item Information</h2>
            <p>Enter the details of the item you want to report.</p>
          </div>
        </div>

        <div className="report-type-selector">
          <label
            className={
              form.reportType === "Lost"
                ? "report-type-active"
                : ""
            }
          >
            <input
              type="radio"
              name="reportType"
              value="Lost"
              checked={form.reportType === "Lost"}
              onChange={handleChange}
            />

            <strong>Lost Item</strong>
            <span>Something you have lost.</span>
          </label>

          <label
            className={
              form.reportType === "Found"
                ? "report-type-active"
                : ""
            }
          >
            <input
              type="radio"
              name="reportType"
              value="Found"
              checked={form.reportType === "Found"}
              onChange={handleChange}
            />

            <strong>Found Item</strong>
            <span>Something you have found.</span>
          </label>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Item name *</span>

            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Black leather wallet"
              required
            />
          </label>

          <label className="form-field">
            <span>Category *</span>

            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              required
            >
              <option value="">Select a category</option>
              <option value="Electronics">Electronics</option>
              <option value="Accessories">Accessories</option>
              <option value="Documents">Documents</option>
              <option value="Clothing">Clothing</option>
              <option value="Bags">Bags</option>
              <option value="Personal Items">Personal Items</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label className="form-field form-field-full">
            <span>Description *</span>

            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Describe the item's color, brand, features, and other identifying details..."
              rows={4}
              required
            />
          </label>

          <label className="form-field">
            <span>
              <MapPin size={15} /> Location *
            </span>

            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="Where was it lost or found?"
              required
            />
          </label>

          <label className="form-field">
            <span>
              <CalendarDays size={15} /> Date *
            </span>

            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              max={new Date().toLocaleDateString("en-CA")}
              required
            />
          </label>

          <label className="form-field form-field-full">
            <span>Item photo (optional)</span>

            <div className="upload-box">
              <Upload size={25} />

              <strong>
                {image ? image.name : "Choose an image"}
              </strong>

              <span>PNG, JPG, or WEBP. Maximum 5 MB.</span>

              <input
                id="item-photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageChange}
                aria-label="Upload item photo"
              />
            </div>
          </label>
        </div>

        {message && (
          <p
            className="form-info"
            role="status"
            aria-live="polite"
            style={{
              color:
                messageType === "error"
                  ? "#DC2626"
                  : "#15803D",
            }}
          >
            {message}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={handleClearForm}
            disabled={isSubmitting}
          >
            Clear Form
          </button>

          <button
            type="submit"
            className="button button-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </form>
    </div>
  );
}

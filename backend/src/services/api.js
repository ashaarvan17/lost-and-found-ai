//backend/src/services/api.js
const API_BASE_URL = "http://localhost:4000/api";

// Fetch all lost and found reports
export async function getAllReports() {
    const response = await fetch(`${API_BASE_URL}/reports`);

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to fetch reports");
    }

    return result.data;
}

// Fetch one report by its ID
export async function getReportById(id) {
    const response = await fetch(`${API_BASE_URL}/reports/${id}`);

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to fetch report");
    }

    return result.data;
}

// Create a new lost or found report
export async function createReport(reportData) {
    const response = await fetch(`${API_BASE_URL}/reports`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(reportData)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to create report");
    }

    return result.data;
}

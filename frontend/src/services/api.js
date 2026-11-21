
// frontend/src/services/api.js

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export function resolveImageUrl(imageUrl) {
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
        return "";
    }

    return new URL(imageUrl.trim(), `${BACKEND_BASE_URL}/`).toString();
}

// Get the authentication token
function getToken() {
    return localStorage.getItem("token");
}

// Common function to handle API responses
async function handleResponse(response) {
    const result = await response.json();

    if (!response.ok) {
        const error = new Error(result.message || "Something went wrong");
        error.status = response.status;
        error.code = result.code;
        throw error;
    }

    return result;
}

// Register a new user
export async function registerUser(userData) {
    const response = await fetch(
        `${API_BASE_URL}/auth/register`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        }
    );

    return handleResponse(response);
}

export async function submitLocalAdminApplication(applicationData) {
    const response = await fetch(`${API_BASE_URL}/auth/register-local-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applicationData),
    });
    return handleResponse(response);
}

export async function getLocalAdminApplications() {
    const response = await fetch(`${API_BASE_URL}/admin/local-admin-applications`, { headers: { Authorization: `Bearer ${getToken()}` } });
    return (await handleResponse(response)).data;
}

export async function reviewLocalAdminApplication(applicationId, action, reason = "") {
    const response = await fetch(`${API_BASE_URL}/admin/local-admin-applications/${applicationId}/actions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
    });
    return handleResponse(response);
}

// Log in an existing user

// Log in an existing user
export async function loginUser(credentials) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(credentials)
    });

    const result = await handleResponse(response);

    if (result.success && result.token) {
        localStorage.setItem("token", result.token);
        localStorage.setItem("user", JSON.stringify(result.user));

    } else {
        throw new Error("Login succeeded without returning an authentication token.");
    }

    return result;
}

export async function loginSuperAdmin(credentials) {
    const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
    });
    const result = await handleResponse(response);
    if (!result.token || result.user?.role !== "admin") {
        throw new Error("Super Admin authentication was not confirmed.");
    }
    localStorage.setItem("token", result.token);
    localStorage.setItem("user", JSON.stringify(result.user));
    return result;
}


// Log out the current user
export function logoutUser() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
}

// Get all reports — used by Browse Items
export async function getAllReports() {
    const response = await fetch(
        `${API_BASE_URL}/reports`
    );

    const result = await handleResponse(response);

    return result.data;
}

// Get one report by ID
export async function getReportById(id) {
    const token = getToken();
    const response = await fetch(
        `${API_BASE_URL}/reports/${id}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );

    const result = await handleResponse(response);

    return result.data;
}


// Create a report — login required

export async function createReport(reportData, imageFile = null) {
  const token = localStorage.getItem("token");

  if (!token) {
    throw new Error("Authentication required. Please log in.");
  }

  const formData = new FormData();

  Object.entries(reportData).forEach(([key, value]) => {
    formData.append(key, value == null ? "" : typeof value === "object" ? JSON.stringify(value) : value);
  });

  if (imageFile) {
    formData.append("image", imageFile);
  }

  const response = await fetch(
    `${API_BASE_URL}/reports`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const result = await handleResponse(response);

  return result.data;
}

export async function getMyMatches() {
  const response = await fetch(`${API_BASE_URL}/reports/matches/my-matches`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

export async function startClaim(candidateId) {
  const response = await fetch(`${API_BASE_URL}/claims/matches/${candidateId}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

export async function getMyClaims() {
  const response = await fetch(`${API_BASE_URL}/claims/my-claims`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

export async function submitClaimAnswers(claimId, answers) {
  const response = await fetch(`${API_BASE_URL}/claims/${claimId}/verify`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ answers }) });
  const result = await handleResponse(response);
  return result.data;
}

export async function getClaimMessages(claimId) {
  const response = await fetch(`${API_BASE_URL}/claims/${claimId}/messages`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

export async function sendClaimMessage(claimId, body) {
  const response = await fetch(`${API_BASE_URL}/claims/${claimId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
  const result = await handleResponse(response);
  return result.data;
}

export async function reportClaimIssue(claimId, reason) {
  const response = await fetch(`${API_BASE_URL}/claims/${claimId}/issues`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
  const result = await handleResponse(response);
  return result.data;
}

export async function getAdminReviewQueue() {
  const response = await fetch(`${API_BASE_URL}/claims/admin/review`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

export async function getSuperAdminStats() {
    const response = await fetch(`${API_BASE_URL}/admin/dashboard/stats`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    return (await handleResponse(response)).data;
}

export async function getSuperAdminReports(view, page = 1, pageSize = 25) {
    const query = new URLSearchParams({ view, page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`${API_BASE_URL}/admin/reports?${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    return handleResponse(response);
}

export async function getAdminReviewDetails(claimId) {
  const response = await fetch(`${API_BASE_URL}/claims/admin/review/${claimId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

export async function performAdminReviewAction(claimId, action, reason) {
  const response = await fetch(`${API_BASE_URL}/claims/admin/review/${claimId}/actions`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
  const result = await handleResponse(response);
  return result.data;
}

export async function submitReviewInformation(claimId, information) {
  const response = await fetch(`${API_BASE_URL}/claims/${claimId}/review-information`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ information }) });
  const result = await handleResponse(response);
  return result.data;
}

export async function updateOwnershipQuestions(reportId, ownershipQuestions) {
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/ownership-questions`, { method: "PATCH", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ ownershipQuestions }) });
  return handleResponse(response);
}

export async function previewValueTier(estimatedValueInr) {
  const response = await fetch(`${API_BASE_URL}/reports/value-tier-preview?estimatedValueInr=${encodeURIComponent(estimatedValueInr)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const result = await handleResponse(response);
  return result.data;
}

async function recoveryRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/recovery${path}`, { ...options, headers: { Authorization: `Bearer ${getToken()}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  return handleResponse(response);
}
export async function getRecoveryTransactions(claimId) { return (await recoveryRequest(`/claims/${claimId}/transactions`)).data; }
export async function getRecoveryTransactionsForReport(reportId) { return (await recoveryRequest(`/reports/${reportId}/transactions`)).data; }
export async function createPersonalHandover(claimId) { return (await recoveryRequest(`/claims/${claimId}/personal-handover`, { method: "POST" })).data; }
export async function createCollection(claimId) { return (await recoveryRequest(`/claims/${claimId}/collection`, { method: "POST" })).data; }
export async function createDeposit(reportId, assignmentId) { return (await recoveryRequest(`/reports/${reportId}/deposit`, { method: "POST", body: JSON.stringify({ assignmentId }) })).data; }
export async function getLocalAdminsForReport(reportId) { return (await recoveryRequest(`/reports/${reportId}/local-admins`)).data; }
export async function getRecoveryTasks() { return (await recoveryRequest("/local-admin/transactions")).data; }
export async function getMyLocalAdminAssignments() { return (await recoveryRequest("/local-admin/assignments")).data; }
export async function generateRecoveryOtp(transactionId) { return (await recoveryRequest(`/transactions/${transactionId}/otp`, { method: "POST" })).data; }
export async function validateRecoveryOtp(transactionId, otp) { return (await recoveryRequest(`/transactions/${transactionId}/validate`, { method: "POST", body: JSON.stringify({ otp }) })).data; }
export async function getLocalAdminAssignments() { return (await recoveryRequest("/admin/local-admin-assignments")).data; }
export async function createLocalAdminAssignment(userId, assignedArea) { return (await recoveryRequest("/admin/local-admin-assignments", { method: "POST", body: JSON.stringify({ userId, assignedArea }) })).data; }
export async function updateLocalAdminAssignment(assignmentId, action) { return (await recoveryRequest(`/admin/local-admin-assignments/${assignmentId}`, { method: "PATCH", body: JSON.stringify({ action }) })).data; }



// Get only the current user's reports — login required
export async function getMyReports() {
    const response = await fetch(
        `${API_BASE_URL}/reports/my-reports`,
        {
            headers: {
                "Authorization": `Bearer ${getToken()}`
            }
        }
    );

    const result = await handleResponse(response);

    return result.data;
}

// Get the currently authenticated user's information
export async function getCurrentUser() {
    const response = await fetch(
        `${API_BASE_URL}/auth/me`,
        {
            headers: {
                "Authorization": `Bearer ${getToken()}`
            }
        }
    );

    return handleResponse(response);
}

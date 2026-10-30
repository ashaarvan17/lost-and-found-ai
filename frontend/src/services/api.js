
// frontend/src/services/api.js

const API_BASE_URL = "http://localhost:4000/api";

// Get the authentication token
function getToken() {
    return localStorage.getItem("token");
}

// Common function to handle API responses
async function handleResponse(response) {
    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.message || "Something went wrong"
        );
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

        console.log("Login successful. Token saved:", Boolean(getToken()));
    } else {
        throw new Error("Login succeeded without returning an authentication token.");
    }

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
    const response = await fetch(
        `${API_BASE_URL}/reports/${id}`
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
    formData.append(key, value ?? "");
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

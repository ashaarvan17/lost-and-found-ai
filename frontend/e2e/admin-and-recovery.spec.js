import { expect, test } from "@playwright/test";

const adminEmail = "phase9-super-admin@example.test";
const adminPassword = "Phase9-E2E-admin-password-123";
const password = "Phase9-E2E-applicant-password-123";

async function submitApplication(page, name, email, area) {
  await page.goto("/register");
  await page.getByRole("tab", { name: "Local Admin application" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Requested operating area").fill(area);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: /Thanks/i })).toBeVisible();
}

async function login(page, email, pass) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(admin|dashboard)$/);
}

test("Super Admin reviews Local Admin applications and separately assigns approved area", async ({ page }) => {
  const suffix = Date.now();
  const approveEmail = `phase9-approve-${suffix}@example.test`;
  const rejectEmail = `phase9-reject-${suffix}@example.test`;
  await submitApplication(page, "Applicant Approved", approveEmail, "Central Station");
  await submitApplication(page, "Applicant Rejected", rejectEmail, "West Station");

  await login(page, adminEmail, adminPassword);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/local-admin-applications");
  await expect(page.getByRole("heading", { name: "Local Admin applications" })).toBeVisible();
  await page.getByRole("button", { name: /Applicant Approved/ }).click();
  await expect(page.getByRole("link", { name: approveEmail })).toBeVisible();
  await page.getByRole("button", { name: "Approve application" }).click();
  await expect(page.getByRole("status")).toContainText("approved");

  await page.getByRole("button", { name: /Applicant Rejected/ }).click();
  await page.getByLabel("Rejection reason").fill("Area coverage is unavailable for this request.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("rejected");

  await page.goto("/admin/local-admins");
  const approvedOption = page.getByLabel("Approved applicant").locator("option").filter({ hasText: approveEmail });
  await page.getByLabel("Approved applicant").selectOption(await approvedOption.getAttribute("value"));
  await expect(page.getByLabel("Assigned area/location")).toHaveValue("Central Station");
  await page.getByRole("button", { name: "Create area assignment" }).click();
  await expect(page.getByText(/Central Station · Active/)).toBeVisible();
});

test("ordinary user cannot access admin review or perform admin actions", async ({ page }) => {
  const email = `phase9-ordinary-${Date.now()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Ordinary E2E User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await login(page, email, password);
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const response = await fetch("http://127.0.0.1:4180/api/claims/admin/review", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status;
  });
  expect([401, 403]).toContain(result);
  await page.goto("/admin/review");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Super Admin reviews escalated claims and approves or rejects with reasons", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.goto("/admin/review");
  await expect(page.getByRole("heading", { name: "Claim review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await page.getByRole("button", { name: /review required/i }).first().click();
  await expect(page.getByRole("heading", { name: "Case details" })).toBeVisible();
  await expect(page.getByText(/Attempt 3: review_required/)).toBeVisible();
  await page.getByLabel("Required reason for action").fill("Reviewed test evidence supports this claim.");
  await page.getByRole("button", { name: "Approve reviewed claim" }).click();
  await expect(page.getByRole("button", { name: /review required/i })).toHaveCount(1);
  await page.getByRole("button", { name: /review required/i }).click();
  await page.getByLabel("Required reason for action").fill("The reviewed test evidence does not support this claim.");
  await page.getByRole("button", { name: "Reject claim" }).click();
  await expect(page.getByText("No cases need review.")).toBeVisible();
});

test("unassigned ordinary user is denied Local Admin recovery task access", async ({ page }) => {
  const email = `phase9-unassigned-${Date.now()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Unassigned E2E User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  await login(page, email, password);
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const response = await fetch("http://127.0.0.1:4180/api/recovery/local-admin/transactions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status;
  });
  expect([401, 403]).toContain(result);
});

test("verified owner creates collection, handles invalid OTP, and Local Admin completes custody", async ({ browser, page }) => {
  const recoveryPassword = "Phase9-E2E-recovery-password-123";
  await login(page, "phase9-claimant@example.test", recoveryPassword);
  await page.goto("/claims");
  const claimCard = page.getByRole("article").filter({ hasText: "Attempts used: 2" });
  await expect(claimCard.getByRole("heading", { name: /low value tier/i })).toBeVisible();
  await claimCard.getByRole("button", { name: "Start Local Admin collection" }).click();
  await claimCard.getByRole("button", { name: "Generate OTP" }).click();
  const otpText = await page.getByRole("status").filter({ hasText: "Share this one-time code" }).textContent();
  const otp = otpText.match(/\b\d{6}\b/)?.[0];
  expect(otp).toMatch(/^\d{6}$/);

  const localAdminPage = await browser.newPage();
  await login(localAdminPage, "phase9-local-admin@example.test", recoveryPassword);
  const taskStatuses = await localAdminPage.evaluate(async () => {
    const response = await fetch("http://127.0.0.1:4180/api/recovery/local-admin/transactions", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    const payload = await response.json();
    return { status: response.status, statuses: (payload.data || []).map((task) => task.status) };
  });
  expect(taskStatuses.status).toBe(200);
  expect(taskStatuses.statuses).toContain("otp_issued");
  await localAdminPage.goto("/recovery/tasks");
  await expect(localAdminPage.getByRole("heading", { name: /local admin recovery/i })).toBeVisible();
  const otpInput = localAdminPage.getByLabel("Six-digit OTP");
  await expect(otpInput).toBeVisible();
  await otpInput.fill("000000");
  await localAdminPage.getByRole("button", { name: "Validate and confirm custody" }).click();
  await expect(localAdminPage.getByRole("alert")).toContainText("OTP");
  await otpInput.fill(otp);
  await localAdminPage.getByRole("button", { name: "Validate and confirm custody" }).click();
  await expect(localAdminPage.getByText("No pending recovery tasks")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/local admin collection.*completed/i)).toBeVisible();
  await localAdminPage.close();
});

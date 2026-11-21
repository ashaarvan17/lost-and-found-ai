import { expect, test } from "@playwright/test";

test("public browse includes resolved lost reports but keeps found reports private", async ({ page }) => {
  await page.route("**/api/reports", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: [
        { _id: "active-lost", type: "lost", status: "active", title: "Active lost bag", category: "Bags", location: "Library" },
        { _id: "resolved-lost", type: "lost", status: "resolved", title: "Resolved lost phone", category: "Electronics", location: "Station" },
        { _id: "closed-lost", type: "lost", status: "closed", title: "Closed lost wallet", category: "Wallets", location: "Park" },
        { _id: "active-found", type: "found", status: "active", title: "Private active found item", category: "Bags", location: "Library" },
        { _id: "resolved-found", type: "found", status: "resolved", title: "Private resolved found item", category: "Bags", location: "Library" },
      ],
    }),
  }));

  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "Active lost bag" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resolved lost phone" })).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  await expect(page.getByText("Closed lost wallet")).toHaveCount(0);
  await expect(page.getByText("Private active found item")).toHaveCount(0);
  await expect(page.getByText("Private resolved found item")).toHaveCount(0);
});

test("registration, login, protected dashboard, and lost-report journey", async ({ browser, page }) => {
  const unauthenticated = await browser.newPage();
  await unauthenticated.goto("/my-reports");
  await expect(unauthenticated).toHaveURL(/\/login$/);
  await unauthenticated.close();

  const email = `phase8-${Date.now()}@example.test`;
  const password = "Phase8-test-password-123";
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Phase Eight User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");

  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("YOUR FINDBACK OVERVIEW")).toBeVisible();

  await page.goto("/report");
  await page.getByLabel("Item name *").fill("Blue umbrella");
  await page.getByLabel("Category *").selectOption("Personal Items");
  await page.getByLabel("Description *").fill("Blue folding umbrella with a wooden handle.");
  await page.getByLabel("Location *").fill("Central Station");
  await page.getByLabel("Date *").fill("2026-11-01");
  await page.getByRole("button", { name: "Submit Report" }).click();
  await expect(page.getByRole("status")).toContainText("submitted successfully");

  await page.goto("/my-reports");
  await expect(page.getByRole("heading", { name: "Blue umbrella" })).toBeVisible();
});

test("Local Admin applicants see pending status and cannot enter protected pages before approval", async ({ page }) => {
  const email = `phase9-applicant-${Date.now()}@example.test`;
  const password = "Phase9-test-password-123";
  await page.goto("/register");
  await page.getByRole("tab", { name: "Local Admin application" }).click();
  await page.getByLabel("Full name").fill("Local Admin Applicant");
  await page.getByLabel("Requested operating area").fill("Central Station");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: /Thanks, Local/i })).toBeVisible();
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("alert")).toContainText("pending Super Admin review");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.evaluate(() => localStorage.getItem("token"))).resolves.toBeNull();
});

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "playwright";

type StepStatus = "passed" | "failed";
type StepResult = {
  role: string;
  step: string;
  status: StepStatus;
  detail: string;
};

const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";
const locale = "zh-HK";
const runId = Date.now().toString().slice(-8);
const requestTitle = `QA 冷氣測試 ${runId}`;
const adminNote = `QA admin schedule ${runId}`;
const demoPassword = process.env.DEMO_PASSWORD ?? "HotfixDemo123!";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "HotfixAdmin123!";

const results: StepResult[] = [];
const created = {
  requestId: "",
  bookingId: "",
};

function record(
  role: string,
  step: string,
  status: StepStatus,
  detail: string,
) {
  results.push({ role, step, status, detail });
}

async function waitForButtonEnabled(page: Page, label: string) {
  const button = page.getByRole("button", { name: label }).first();
  await button.waitFor({ state: "visible", timeout: 30000 });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await button.isEnabled()) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Button "${label}" stayed disabled.`);
}

async function waitForSelectEnabled(page: Page, label: string) {
  await page.waitForFunction(
    (selectLabel) => {
      const selectors = Array.from(document.querySelectorAll("select"));
      return selectors.some((select) => {
        const ariaLabel = select.getAttribute("aria-label");
        return ariaLabel === selectLabel && !select.disabled;
      });
    },
    label,
    { timeout: 30000 },
  );
}

async function waitForTextAfterRefresh(page: Page, text: string) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (
      await page
        .getByText(text)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  }

  await page.getByText(text).first().waitFor({ timeout: 1000 });
}

async function waitForPath(
  page: Page,
  matcher: string | ((pathname: string) => boolean),
) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname;
    const matched =
      typeof matcher === "string" ? pathname === matcher : matcher(pathname);
    if (matched) {
      return;
    }

    await page.waitForTimeout(100);
  }

  throw new Error(
    `Timed out waiting for pathname match. Current path: ${new URL(page.url()).pathname}`,
  );
}

async function logStep(
  role: string,
  step: string,
  detail: string,
  work: () => Promise<void>,
) {
  try {
    await work();
    record(role, step, "passed", detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(role, step, "failed", `${detail}. ${message}`);
    throw error;
  }
}

async function login(
  page: Page,
  identifier: string,
  password: string,
  expectedPath: string,
) {
  await page.goto(`${baseUrl}/${locale}/auth/login`, {
    waitUntil: "domcontentloaded",
  });
  await waitForButtonEnabled(page, "登入");
  await page.locator('input[name="identifier"]').fill(identifier);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await waitForPath(page, expectedPath);
}

async function logout(page: Page, rolePath: string) {
  await page.goto(`${baseUrl}/${locale}${rolePath}`, {
    waitUntil: "domcontentloaded",
  });
  const logoutButton = page.getByRole("button", { name: "登出" });
  if ((await logoutButton.count()) === 0) {
    const buttons = await page.locator("button").allInnerTexts();
    const bodyText = (await page.locator("body").innerText()).slice(0, 1200);
    throw new Error(
      `Logout button not found at ${page.url()}. Buttons: ${buttons.join(", ")}. Body: ${bodyText}`,
    );
  }
  await waitForButtonEnabled(page, "登出");
  await logoutButton.click();
  await waitForPath(page, `/${locale}`);
}

async function main() {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const docsDir = path.join(process.cwd(), "docs");
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();

    await logStep(
      "customer",
      "Auth hub",
      "Opened the auth overview page",
      async () => {
        await customerPage.goto(`${baseUrl}/${locale}/auth`, {
          waitUntil: "domcontentloaded",
        });
        await customerPage.getByText("同一平台，三個角色化工作台").waitFor();
      },
    );

    await logStep(
      "customer",
      "Login",
      "Logged in with seeded customer account",
      async () => {
        await login(
          customerPage,
          "amy@hotfix.hk",
          demoPassword,
          `/${locale}/customer`,
        );
      },
    );

    await logStep(
      "customer",
      "Create request",
      "Created a new aircon request in Kwun Tong district",
      async () => {
        await customerPage.goto(`${baseUrl}/${locale}/customer/requests/new`, {
          waitUntil: "domcontentloaded",
        });
        await waitForButtonEnabled(customerPage, "提交服務請求");
        await customerPage.locator('input[name="title"]').fill(requestTitle);
        await customerPage
          .locator('textarea[name="description"]')
          .fill(
            "窗口冷氣滴水並伴隨異味，需要上門檢查、清洗去水及確認是否要更換零件。",
          );
        await customerPage
          .locator('select[name="categoryId"]')
          .selectOption("aircon");
        await customerPage
          .locator('select[name="subcategoryId"]')
          .selectOption("repair");
        await customerPage
          .locator('select[name="urgency"]')
          .selectOption("asap");
        await customerPage
          .locator('select[name="address.district"]')
          .selectOption("Kwun Tong");
        await customerPage
          .locator('select[name="address.area"]')
          .selectOption("Lam Tin");
        await customerPage
          .locator('input[name="address.buildingEstate"]')
          .fill("測試大廈");
        await customerPage.locator('input[name="address.block"]').fill("A 座");
        await customerPage.locator('input[name="address.floor"]').fill("12/F");
        await customerPage
          .locator('input[name="address.flatRoom"]')
          .fill("1203");
        await customerPage
          .locator('textarea[name="accessNotes"]')
          .fill("大堂保安已知會，可代為登記。");
        await customerPage
          .locator('input[name="address.landmarkNotes"]')
          .fill("港鐵藍田站 A 出口步行 5 分鐘。");
        await customerPage.locator('input[name="budgetMin"]').fill("900");
        await customerPage.locator('input[name="budgetMax"]').fill("1400");
        await customerPage.locator('button[type="submit"]').click();
        await waitForPath(
          customerPage,
          (pathname) =>
            pathname.includes(`/${locale}/customer/requests/`) &&
            !pathname.endsWith("/new"),
        );
        created.requestId = customerPage.url().split("/").pop() ?? "";
        if (!created.requestId) {
          throw new Error("Request ID not found after submission.");
        }
        await customerPage.waitForTimeout(500);
      },
    );

    await logStep(
      "customer",
      "Logout",
      "Logged out after request submission",
      async () => {
        await logout(customerPage, "/customer");
      },
    );
    await customerContext.close();

    const proContext = await browser.newContext();
    const proPage = await proContext.newPage();

    await logStep(
      "pro",
      "Login",
      "Logged in with seeded professional account",
      async () => {
        await login(proPage, "chan@hotfix.hk", demoPassword, `/${locale}/pro`);
      },
    );

    await logStep(
      "pro",
      "Profile save",
      "Saved the professional profile successfully",
      async () => {
        await proPage.goto(`${baseUrl}/${locale}/pro/profile`, {
          waitUntil: "domcontentloaded",
        });
        await waitForButtonEnabled(proPage, "儲存檔案");
        const intro = proPage.locator('textarea[name="introduction"]');
        const currentIntro = await intro.inputValue();
        await intro.fill(`${currentIntro} QA run ${runId}`);
        await proPage.getByRole("button", { name: "儲存檔案" }).click();
        await proPage.getByText("已儲存檔案。").waitFor();
      },
    );

    await logStep(
      "pro",
      "Lead discovery",
      "Found the newly created request in matched leads",
      async () => {
        await proPage.goto(`${baseUrl}/${locale}/pro/leads`, {
          waitUntil: "domcontentloaded",
        });
        await proPage.getByText(requestTitle, { exact: true }).waitFor();
        await proPage.getByText(requestTitle, { exact: true }).click();
        await waitForPath(proPage, `/${locale}/pro/leads/${created.requestId}`);
      },
    );

    await logStep(
      "pro",
      "Send quote",
      "Submitted a structured quote for the customer request",
      async () => {
        await waitForButtonEnabled(proPage, "提交報價");
        await proPage.locator('input[name="quoteAmount"]').fill("980");
        await proPage.locator('input[name="total"]').fill("980");
        await proPage.locator('input[name="labourEstimate"]').fill("650");
        await proPage.locator('input[name="partsEstimate"]').fill("230");
        await proPage.locator('input[name="callOutFee"]').fill("100");
        await proPage
          .locator('textarea[name="includedWork"]')
          .fill("檢查滴水原因、清洗去水位、清理濾網及測試排水。");
        await proPage
          .locator('textarea[name="exclusions"]')
          .fill("如需更換主板或壓縮機會再報價。");
        await proPage
          .locator('input[name="earliestAvailability"]')
          .fill("2026-04-04T10:30");
        await proPage
          .locator('textarea[name="noteToCustomer"]')
          .fill("可於明早上門，完成後會再測試滴水情況並向你匯報。");
        await proPage.getByRole("button", { name: "提交報價" }).click();
        await proPage.getByText("你的報價已送出，客戶現可直接查看。").waitFor();
      },
    );

    await logStep("pro", "Logout", "Logged out after quoting", async () => {
      await logout(proPage, "/pro");
    });
    await proContext.close();

    const customerReviewContext = await browser.newContext();
    const customerReviewPage = await customerReviewContext.newPage();

    await logStep(
      "customer",
      "Login to review quote",
      "Returned to the customer workspace to review incoming quote",
      async () => {
        await login(
          customerReviewPage,
          "amy@hotfix.hk",
          demoPassword,
          `/${locale}/customer`,
        );
        await customerReviewPage.goto(
          `${baseUrl}/${locale}/customer/requests/${created.requestId}`,
          {
            waitUntil: "domcontentloaded",
          },
        );
        await waitForTextAfterRefresh(customerReviewPage, "陳記冷氣水電");
      },
    );

    await logStep(
      "customer",
      "Accept quote",
      "Accepted the quote and created a booking",
      async () => {
        await waitForButtonEnabled(customerReviewPage, "接受報價");
        await customerReviewPage
          .getByRole("button", { name: "接受報價" })
          .click();
        await customerReviewPage.waitForTimeout(1000);
        await customerReviewPage.goto(`${baseUrl}/${locale}/customer/orders`, {
          waitUntil: "domcontentloaded",
        });
        await customerReviewPage
          .getByText(requestTitle, { exact: true })
          .waitFor();
        await customerReviewPage
          .getByText(requestTitle, { exact: true })
          .click();
        await waitForPath(customerReviewPage, (pathname) =>
          pathname.startsWith(`/${locale}/customer/orders/`),
        );
        created.bookingId = customerReviewPage.url().split("/").pop() ?? "";
        if (!created.bookingId) {
          throw new Error("Booking ID not found after quote acceptance.");
        }
      },
    );

    await logStep(
      "customer",
      "Messages",
      "Verified customer notifications page loads after booking acceptance",
      async () => {
        await customerReviewPage.goto(
          `${baseUrl}/${locale}/customer/messages`,
          { waitUntil: "domcontentloaded" },
        );
        await customerReviewPage.getByText("收到新報價").first().waitFor();
      },
    );

    await logStep(
      "customer",
      "Logout",
      "Logged out after accepting the quote",
      async () => {
        await logout(customerReviewPage, "/customer");
      },
    );
    await customerReviewContext.close();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await logStep(
      "admin",
      "Login",
      "Logged in with the internal admin account",
      async () => {
        await login(
          adminPage,
          "ops@hotfix.hk",
          adminPassword,
          `/${locale}/admin`,
        );
      },
    );

    await logStep(
      "admin",
      "Request review",
      "Opened the new request and applied a manual scheduled status with admin note",
      async () => {
        await adminPage.goto(
          `${baseUrl}/${locale}/admin/requests/${created.requestId}`,
          { waitUntil: "domcontentloaded" },
        );
        await waitForSelectEnabled(adminPage, "請求狀態");
        await adminPage.getByLabel("請求狀態").selectOption("scheduled");
        await adminPage.getByLabel("營運備註").fill(adminNote);
        await waitForButtonEnabled(adminPage, "更新");
        await adminPage.getByRole("button", { name: "更新" }).click();
        await adminPage.getByText(adminNote).waitFor();
      },
    );

    await logStep(
      "admin",
      "Customer detail",
      "Opened the admin customer detail page for the request owner",
      async () => {
        await adminPage.goto(
          `${baseUrl}/${locale}/admin/customers/user_customer_amy`,
          { waitUntil: "domcontentloaded" },
        );
        await adminPage.getByText(requestTitle, { exact: true }).waitFor();
      },
    );

    await logStep(
      "admin",
      "Pro detail",
      "Opened the admin professional detail page for the quoting professional",
      async () => {
        await adminPage.goto(`${baseUrl}/${locale}/admin/pros/user_pro_chan`, {
          waitUntil: "domcontentloaded",
        });
        await adminPage
          .getByRole("heading", { name: "陳記冷氣水電" })
          .waitFor();
      },
    );

    await logStep(
      "admin",
      "Quote detail",
      "Opened the admin quote detail page for the generated quote",
      async () => {
        await adminPage.goto(`${baseUrl}/${locale}/admin/quotes`, {
          waitUntil: "domcontentloaded",
        });
        const row = adminPage.locator("tr", { hasText: requestTitle }).first();
        await row.locator("a").first().click();
        await waitForPath(adminPage, (pathname) =>
          pathname.startsWith(`/${locale}/admin/quotes/`),
        );
        await adminPage
          .getByRole("link", { name: new RegExp(requestTitle) })
          .first()
          .waitFor();
      },
    );

    await logStep(
      "admin",
      "Logout",
      "Logged out after ops verification",
      async () => {
        await logout(adminPage, "/admin");
      },
    );
    await adminContext.close();

    const proDeliveryContext = await browser.newContext();
    const proDeliveryPage = await proDeliveryContext.newPage();

    await logStep(
      "pro",
      "Login for delivery",
      "Logged back in as the professional to update booking progress",
      async () => {
        await login(
          proDeliveryPage,
          "chan@hotfix.hk",
          demoPassword,
          `/${locale}/pro`,
        );
      },
    );

    await logStep(
      "pro",
      "Job progress",
      "Moved the booking from scheduled to in progress and then completed",
      async () => {
        await proDeliveryPage.goto(
          `${baseUrl}/${locale}/pro/jobs/${created.bookingId}`,
          { waitUntil: "domcontentloaded" },
        );
        const bookingStatus = proDeliveryPage.getByLabel("訂單狀態");
        await bookingStatus.selectOption("in_progress");
        await proDeliveryPage.waitForTimeout(700);
        await bookingStatus.selectOption("completed");
        await proDeliveryPage.waitForTimeout(700);
        const finalStatus = await bookingStatus.inputValue();
        if (finalStatus !== "completed") {
          throw new Error(
            `Expected completed booking status, received ${finalStatus}.`,
          );
        }
      },
    );

    await logStep(
      "pro",
      "Logout",
      "Logged out after marking the job completed",
      async () => {
        await logout(proDeliveryPage, "/pro");
      },
    );
    await proDeliveryContext.close();

    const customerFinalContext = await browser.newContext();
    const customerFinalPage = await customerFinalContext.newPage();

    await logStep(
      "customer",
      "Final verification",
      "Confirmed the completed order timeline and notifications",
      async () => {
        await login(
          customerFinalPage,
          "amy@hotfix.hk",
          demoPassword,
          `/${locale}/customer`,
        );
        await customerFinalPage.goto(
          `${baseUrl}/${locale}/customer/orders/${created.bookingId}`,
          {
            waitUntil: "domcontentloaded",
          },
        );
        await customerFinalPage.getByText("已完成").first().waitFor();
        await customerFinalPage.goto(`${baseUrl}/${locale}/customer/messages`, {
          waitUntil: "domcontentloaded",
        });
        await customerFinalPage
          .getByText("服務請求狀態已更新")
          .first()
          .waitFor();
      },
    );

    await logStep(
      "customer",
      "Logout",
      "Logged out after final customer validation",
      async () => {
        await logout(customerFinalPage, "/customer");
      },
    );
    await customerFinalContext.close();
  } catch (error) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/${locale}/auth/login`).catch(() => {});
    await page
      .screenshot({ path: path.join(artifactsDir, `qa-failure-${runId}.png`) })
      .catch(() => {});
    await page.close();
    throw error;
  } finally {
    await browser.close();
    const passed = results.filter(
      (result) => result.status === "passed",
    ).length;
    const failed = results.filter(
      (result) => result.status === "failed",
    ).length;
    const markdown = [
      "# Role Flow QA Report",
      "",
      `- Run ID: \`${runId}\``,
      `- Base URL: \`${baseUrl}\``,
      `- Locale tested: \`${locale}\``,
      `- Request title: \`${requestTitle}\``,
      `- Request ID: \`${created.requestId || "n/a"}\``,
      `- Booking ID: \`${created.bookingId || "n/a"}\``,
      `- Passed steps: \`${passed}\``,
      `- Failed steps: \`${failed}\``,
      "",
      "## Step Results",
      "",
      "| Role | Step | Status | Detail |",
      "| --- | --- | --- | --- |",
      ...results.map(
        (result) =>
          `| ${result.role} | ${result.step} | ${result.status} | ${result.detail.replaceAll("|", "/")} |`,
      ),
      "",
    ].join("\n");

    await writeFile(
      path.join(docsDir, "qa-role-flow-report.md"),
      markdown,
      "utf8",
    );
    console.log(markdown);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

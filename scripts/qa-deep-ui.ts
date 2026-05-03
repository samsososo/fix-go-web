import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, devices, type Locator, type Page } from "playwright";

type StepStatus = "passed" | "failed";
type StepResult = {
  area: string;
  step: string;
  status: StepStatus;
  detail: string;
};

const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";
const locale = "zh-HK";
const runId = Date.now().toString().slice(-8);
const requestTitle = `Deep QA 冷氣測試 ${runId}`;
const adminNote = `Deep QA admin note ${runId}`;
const demoPassword = process.env.DEMO_PASSWORD ?? "HotfixDemo123!";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "HotfixAdmin123!";

const locales = new Set(["zh-HK", "en"]);
const results: StepResult[] = [];
const created = {
  requestId: "",
  bookingId: "",
};

function record(
  area: string,
  step: string,
  status: StepStatus,
  detail: string,
) {
  results.push({ area, step, status, detail });
}

function hasDuplicatedLocale(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length > 1 &&
    locales.has(segments[0] ?? "") &&
    locales.has(segments[1] ?? "")
  );
}

async function assertHealthyPage(page: Page) {
  const pathname = new URL(page.url()).pathname;
  if (hasDuplicatedLocale(pathname)) {
    throw new Error(`Duplicated locale detected in pathname ${pathname}.`);
  }

  const body = await page.locator("body").innerText();
  if (body.includes("Application error")) {
    throw new Error(`Application error rendered at ${pathname}.`);
  }
  if (body.includes("This page could not be found")) {
    throw new Error(`Not found page rendered at ${pathname}.`);
  }
}

async function logStep(
  area: string,
  step: string,
  detail: string,
  work: () => Promise<void>,
) {
  try {
    await work();
    record(area, step, "passed", detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(area, step, "failed", `${detail}. ${message}`);
    throw error;
  }
}

async function waitForPath(
  page: Page,
  matcher: string | RegExp | ((pathname: string) => boolean),
) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname;
    const matched =
      typeof matcher === "string"
        ? pathname === matcher
        : matcher instanceof RegExp
          ? matcher.test(pathname)
          : matcher(pathname);

    if (matched) {
      await assertHealthyPage(page);
      return;
    }

    await page.waitForTimeout(100);
  }

  throw new Error(
    `Timed out waiting for pathname match. Current path: ${new URL(page.url()).pathname}`,
  );
}

async function gotoPath(page: Page, pathname: string) {
  const response = await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: "domcontentloaded",
  });
  if (response && response.status() >= 400) {
    throw new Error(`GET ${pathname} returned ${response.status()}.`);
  }
  await assertHealthyPage(page);
}

async function clickAndWait(
  page: Page,
  locator: Locator,
  matcher: string | RegExp | ((pathname: string) => boolean),
) {
  await locator.click();
  await waitForPath(page, matcher);
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

function visibleLocaleSwitcher(page: Page) {
  return page.locator('select[aria-label="Switch locale"]:visible').first();
}

async function waitForLocaleSwitcherValue(page: Page, value: string) {
  await page.waitForFunction(
    (expectedValue) => {
      const switchers = Array.from(
        document.querySelectorAll<HTMLSelectElement>(
          'select[aria-label="Switch locale"]',
        ),
      );
      return switchers.some(
        (switcher) =>
          switcher.value === expectedValue &&
          switcher.getBoundingClientRect().width > 0,
      );
    },
    value,
    { timeout: 10000 },
  );
}

async function ensureMobileMenuOpen(page: Page) {
  const isOpen = await page
    .locator("details")
    .evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await page.locator("summary").click({ force: true });
    await page.waitForFunction(() =>
      document.querySelector("details")?.hasAttribute("open"),
    );
  }
}

async function login(
  page: Page,
  identifier: string,
  password: string,
  expectedPath: string,
) {
  await gotoPath(page, `/${locale}/auth/login`);
  await waitForButtonEnabled(page, "登入");
  await page.locator('input[name="identifier"]').fill(identifier);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await waitForPath(page, expectedPath);
}

async function logout(page: Page, rolePath: string) {
  await gotoPath(page, `/${locale}${rolePath}`);
  await waitForButtonEnabled(page, "登出");
  await page.getByRole("button", { name: "登出" }).click();
  await waitForPath(page, `/${locale}`);
}

async function main() {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const docsDir = path.join(process.cwd(), "docs");
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    await logStep(
      "guest",
      "Public home",
      "Opened the public homepage without routing errors",
      async () => {
        await gotoPath(guestPage, `/${locale}`);
        await guestPage.getByRole("heading", { level: 1 }).waitFor();
      },
    );

    await logStep(
      "guest",
      "Header navigation",
      "Clicked through all primary desktop public navigation links",
      async () => {
        const header = guestPage.locator("header");
        await clickAndWait(
          guestPage,
          header.getByRole("link", { name: "運作方式" }),
          `/${locale}/how-it-works`,
        );
        await clickAndWait(
          guestPage,
          header.getByRole("link", { name: "服務分類" }),
          `/${locale}/categories`,
        );
        await clickAndWait(
          guestPage,
          header.getByRole("link", { name: "成為師傅" }),
          `/${locale}/become-a-pro`,
        );
        await clickAndWait(
          guestPage,
          header.getByRole("link", { name: "常見問題與保障" }),
          `/${locale}/faq`,
        );
        await clickAndWait(
          guestPage,
          header.getByRole("link", { name: "主頁" }),
          `/${locale}`,
        );
      },
    );

    await logStep(
      "guest",
      "Locale switch",
      "Switched to English and back without generating duplicated locale segments",
      async () => {
        await waitForLocaleSwitcherValue(guestPage, "zh-HK");
        await visibleLocaleSwitcher(guestPage).selectOption("en");
        await waitForPath(guestPage, "/en");
        await waitForLocaleSwitcherValue(guestPage, "en");
        await visibleLocaleSwitcher(guestPage).selectOption("zh-HK");
        await waitForPath(guestPage, `/${locale}`);
      },
    );

    await logStep(
      "guest",
      "Auth entry points",
      "Opened auth hub, login, and signup pages from desktop navigation",
      async () => {
        await clickAndWait(
          guestPage,
          guestPage.getByRole("link", { name: "登入" }).first(),
          `/${locale}/auth`,
        );
        await clickAndWait(
          guestPage,
          guestPage.getByRole("link", { name: "前往登入" }),
          `/${locale}/auth/login`,
        );
        await clickAndWait(
          guestPage,
          guestPage.getByRole("link", { name: "查看登入總覽" }),
          `/${locale}/auth`,
        );
        await clickAndWait(
          guestPage,
          guestPage.getByRole("link", { name: "前往註冊" }),
          `/${locale}/auth/signup`,
        );
      },
    );

    await logStep(
      "guest",
      "Duplicated locale normalization",
      "Direct access to a duplicated locale URL normalized before auth redirect",
      async () => {
        await gotoPath(guestPage, `/${locale}/${locale}/customer/requests/new`);
        await waitForPath(guestPage, `/${locale}/auth/login`);
      },
    );

    await logStep(
      "guest",
      "Protected route redirects",
      "Guest access to customer, pro, and admin areas redirected to login",
      async () => {
        await gotoPath(guestPage, `/${locale}/customer`);
        await waitForPath(guestPage, `/${locale}/auth/login`);
        await gotoPath(guestPage, `/${locale}/pro`);
        await waitForPath(guestPage, `/${locale}/auth/login`);
        await gotoPath(guestPage, `/${locale}/admin`);
        await waitForPath(guestPage, `/${locale}/auth/login`);
      },
    );

    await guestContext.close();

    const mobileContext = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const mobilePage = await mobileContext.newPage();

    await logStep(
      "mobile",
      "Public navigation menu",
      "Opened the mobile menu and navigated through public pages",
      async () => {
        await gotoPath(mobilePage, `/${locale}`);
        await ensureMobileMenuOpen(mobilePage);
        await clickAndWait(
          mobilePage,
          mobilePage
            .locator(`details[open] a[href="/${locale}/categories"]`)
            .first(),
          `/${locale}/categories`,
        );
        await ensureMobileMenuOpen(mobilePage);
        await clickAndWait(
          mobilePage,
          mobilePage.locator(`details[open] a[href="/${locale}/auth"]`).first(),
          `/${locale}/auth`,
        );
      },
    );

    await mobileContext.close();

    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();

    await logStep(
      "customer",
      "Login",
      "Customer signed in and landed on the dashboard",
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
      "Workspace CTA",
      "Header workspace button opened the customer portal without duplicated locale",
      async () => {
        await gotoPath(customerPage, `/${locale}`);
        await clickAndWait(
          customerPage,
          customerPage.getByRole("link", { name: "客戶中心" }).first(),
          `/${locale}/customer`,
        );
      },
    );

    await logStep(
      "customer",
      "Portal navigation",
      "Clicked every customer portal navigation entry and loaded each page",
      async () => {
        const customerNav = customerPage.locator(".surface-panel").first();
        await clickAndWait(
          customerPage,
          customerNav.getByRole("link", { name: "建立請求" }),
          `/${locale}/customer/requests/new`,
        );
        await customerPage.locator('input[name="title"]').waitFor();
        await clickAndWait(
          customerPage,
          customerNav.getByRole("link", { name: "訂單" }),
          `/${locale}/customer/orders`,
        );
        await customerPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          customerPage,
          customerNav.getByRole("link", { name: "訊息中心" }),
          `/${locale}/customer/messages`,
        );
        await customerPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          customerPage,
          customerNav.getByRole("link", { name: "個人資料" }),
          `/${locale}/customer/profile`,
        );
        await customerPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          customerPage,
          customerNav.getByRole("link", { name: "主頁" }),
          `/${locale}/customer`,
        );
        await customerPage.getByRole("heading", { level: 1 }).waitFor();
      },
    );

    await logStep(
      "customer",
      "Create request",
      "Filled the request form, interacted with all key inputs, and reached request detail",
      async () => {
        const customerNav = customerPage.locator(".surface-panel").first();
        await clickAndWait(
          customerPage,
          customerNav.getByRole("link", { name: "建立請求" }),
          `/${locale}/customer/requests/new`,
        );
        await waitForButtonEnabled(customerPage, "提交服務請求");
        await customerPage.locator('input[name="title"]').fill(requestTitle);
        await customerPage
          .locator('textarea[name="description"]')
          .fill(
            "窗口冷氣滴水並伴隨異味，需要檢查去水、清洗及確認是否要更換配件。",
          );
        await customerPage
          .locator('select[name="categoryId"]')
          .selectOption("aircon");
        await customerPage
          .locator('select[name="subcategoryId"]')
          .selectOption("repair");
        await customerPage
          .locator('select[name="urgency"]')
          .selectOption("tomorrow");
        await customerPage
          .locator('select[name="address.district"]')
          .selectOption("Kwun Tong");
        await customerPage
          .locator('select[name="address.area"]')
          .selectOption("Lam Tin");
        await customerPage
          .locator('input[name="address.buildingEstate"]')
          .fill("深度測試大廈");
        await customerPage.locator('input[name="address.block"]').fill("B 座");
        await customerPage.locator('input[name="address.floor"]').fill("9/F");
        await customerPage.locator('input[name="address.flatRoom"]').fill("9C");
        await customerPage
          .locator('input[name="scheduledDate"]')
          .fill("2026-04-05T10:00");
        await customerPage
          .locator('textarea[name="accessNotes"]')
          .fill("大堂已登記，請到達前致電。");
        await customerPage
          .locator('input[name="address.landmarkNotes"]')
          .fill("藍田站附近。");
        await customerPage.locator('input[name="budgetMin"]').fill("900");
        await customerPage.locator('input[name="budgetMax"]').fill("1500");
        await customerPage.locator('input[type="file"]').setInputFiles({
          name: "qa-leak.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("fake-image-data"),
        });
        await customerPage
          .getByRole("button", { name: "提交服務請求" })
          .click();
        await waitForPath(
          customerPage,
          (pathname) =>
            pathname.startsWith(`/${locale}/customer/requests/`) &&
            !pathname.endsWith("/new"),
        );
        created.requestId = customerPage.url().split("/").pop() ?? "";
        if (!created.requestId) {
          throw new Error("Request detail URL did not contain a request id.");
        }
        await customerPage
          .getByRole("heading", { name: requestTitle })
          .waitFor();
      },
    );

    await logStep(
      "customer",
      "Logout",
      "Customer session closed cleanly",
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
      "Professional signed in and landed on the pro dashboard",
      async () => {
        await login(proPage, "chan@hotfix.hk", demoPassword, `/${locale}/pro`);
      },
    );

    await logStep(
      "pro",
      "Workspace CTA",
      "Header workspace button opened the pro portal without duplicated locale",
      async () => {
        await gotoPath(proPage, `/${locale}`);
        await clickAndWait(
          proPage,
          proPage.getByRole("link", { name: "師傅中心" }).first(),
          `/${locale}/pro`,
        );
      },
    );

    await logStep(
      "pro",
      "Portal navigation",
      "Clicked every pro portal navigation entry and loaded each page",
      async () => {
        const proNav = proPage.locator(".surface-panel").first();
        await clickAndWait(
          proPage,
          proNav.getByRole("link", { name: "檔案" }),
          `/${locale}/pro/profile`,
        );
        await proPage.locator('textarea[name="introduction"]').waitFor();
        await clickAndWait(
          proPage,
          proNav.getByRole("link", { name: "工作機會" }),
          `/${locale}/pro/leads`,
        );
        await proPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          proPage,
          proNav.getByRole("link", { name: "已接訂單" }),
          `/${locale}/pro/jobs`,
        );
        await proPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          proPage,
          proNav.getByRole("link", { name: "收入" }),
          `/${locale}/pro/earnings`,
        );
        await proPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          proPage,
          proNav.getByRole("link", { name: "主頁" }),
          `/${locale}/pro`,
        );
        await proPage.getByRole("heading", { level: 1 }).waitFor();
      },
    );

    await logStep(
      "pro",
      "Profile save",
      "Professional profile page accepted input and saved successfully",
      async () => {
        await gotoPath(proPage, `/${locale}/pro/profile`);
        await waitForButtonEnabled(proPage, "儲存檔案");
        const intro = proPage.locator('textarea[name="introduction"]');
        const currentIntro = await intro.inputValue();
        await intro.fill(`${currentIntro} Deep QA ${runId}`);
        await proPage.getByRole("button", { name: "儲存檔案" }).click();
        await proPage.getByText("已儲存檔案。").waitFor();
      },
    );

    await logStep(
      "pro",
      "Lead detail",
      "Matched lead card opened correctly and quote form inputs were interactive",
      async () => {
        await gotoPath(proPage, `/${locale}/pro/leads`);
        await clickAndWait(
          proPage,
          proPage.getByText(requestTitle).first(),
          `/${locale}/pro/leads/${created.requestId}`,
        );
        await waitForButtonEnabled(proPage, "提交報價");
        await proPage.locator('input[name="quoteAmount"]').fill("1180");
        await proPage.locator('input[name="total"]').fill("1180");
        await proPage.locator('input[name="labourEstimate"]').fill("820");
        await proPage.locator('input[name="partsEstimate"]').fill("260");
        await proPage.locator('input[name="callOutFee"]').fill("100");
        await proPage
          .locator('textarea[name="includedWork"]')
          .fill("檢查滴水位置、清洗去水盤、測試排水及基本清潔。");
        await proPage
          .locator('textarea[name="exclusions"]')
          .fill("如需更換主板或壓縮機會另行報價。");
        await proPage
          .locator('input[name="earliestAvailability"]')
          .fill("2026-04-05T11:30");
        await proPage
          .locator('textarea[name="noteToCustomer"]')
          .fill("明早可上門，完成後會即場交代情況。");
        await proPage.getByRole("button", { name: "提交報價" }).click();
        await proPage.getByText("你的報價已送出，客戶現可直接查看。").waitFor();
      },
    );

    await logStep(
      "pro",
      "Logout",
      "Professional session closed after quoting",
      async () => {
        await logout(proPage, "/pro");
      },
    );
    await proContext.close();

    const customerReviewContext = await browser.newContext();
    const customerReviewPage = await customerReviewContext.newPage();

    await logStep(
      "customer",
      "Review quote",
      "Customer reopened request detail and saw the incoming professional quote",
      async () => {
        await login(
          customerReviewPage,
          "amy@hotfix.hk",
          demoPassword,
          `/${locale}/customer`,
        );
        await gotoPath(
          customerReviewPage,
          `/${locale}/customer/requests/${created.requestId}`,
        );
        await waitForTextAfterRefresh(customerReviewPage, "陳記冷氣水電");
        await customerReviewPage
          .getByRole("button", { name: "接受報價" })
          .waitFor();
      },
    );

    await logStep(
      "customer",
      "Accept quote and order detail",
      "Customer accepted the quote, opened orders, and entered booking detail",
      async () => {
        await customerReviewPage
          .getByRole("button", { name: "接受報價" })
          .click();
        await customerReviewPage.waitForTimeout(1000);
        await gotoPath(customerReviewPage, `/${locale}/customer/orders`);
        await clickAndWait(
          customerReviewPage,
          customerReviewPage.locator("a", { hasText: requestTitle }).first(),
          (pathname) => pathname.startsWith(`/${locale}/customer/orders/`),
        );
        created.bookingId = customerReviewPage.url().split("/").pop() ?? "";
        if (!created.bookingId) {
          throw new Error("Booking detail URL did not contain a booking id.");
        }
        await customerReviewPage
          .getByRole("heading", { name: requestTitle })
          .waitFor();
      },
    );

    await logStep(
      "customer",
      "Messages page",
      "Customer notification centre remained reachable after booking creation",
      async () => {
        await gotoPath(customerReviewPage, `/${locale}/customer/messages`);
        await customerReviewPage.getByText("收到新報價").first().waitFor();
      },
    );

    await logStep(
      "customer",
      "Logout after acceptance",
      "Customer session closed after booking acceptance",
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
      "Admin signed in and landed on the operations dashboard",
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
      "Workspace CTA",
      "Header workspace button opened the admin portal without duplicated locale",
      async () => {
        await gotoPath(adminPage, `/${locale}`);
        await clickAndWait(
          adminPage,
          adminPage.getByRole("link", { name: "營運後台" }).first(),
          `/${locale}/admin`,
        );
      },
    );

    await logStep(
      "admin",
      "Portal navigation",
      "Clicked every admin portal navigation entry and loaded each page",
      async () => {
        const adminNav = adminPage.locator(".surface-panel").first();
        await clickAndWait(
          adminPage,
          adminNav.getByRole("link", { name: "客戶" }),
          `/${locale}/admin/customers`,
        );
        await adminPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          adminPage,
          adminNav.getByRole("link", { name: "師傅" }),
          `/${locale}/admin/pros`,
        );
        await adminPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          adminPage,
          adminNav.getByRole("link", { name: "服務請求" }),
          `/${locale}/admin/requests`,
        );
        await adminPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          adminPage,
          adminNav.getByRole("link", { name: "報價" }),
          `/${locale}/admin/quotes`,
        );
        await adminPage.getByRole("heading", { level: 1 }).waitFor();
        await clickAndWait(
          adminPage,
          adminNav.getByRole("link", { name: "總覽" }),
          `/${locale}/admin`,
        );
        await adminPage.getByRole("heading", { level: 1 }).waitFor();
      },
    );

    await logStep(
      "admin",
      "Request, customer, pro, and quote details",
      "Admin opened all linked detail pages from the newly created marketplace records",
      async () => {
        await gotoPath(
          adminPage,
          `/${locale}/admin/requests/${created.requestId}`,
        );
        await waitForButtonEnabled(adminPage, "更新");
        await waitForSelectEnabled(adminPage, "請求狀態");
        await adminPage.getByLabel("請求狀態").selectOption("scheduled");
        await adminPage.getByLabel("營運備註").fill(adminNote);
        await adminPage.getByRole("button", { name: "更新" }).click();
        await adminPage.getByText(adminNote).waitFor();

        await gotoPath(
          adminPage,
          `/${locale}/admin/customers/user_customer_amy`,
        );
        await adminPage.getByText(requestTitle).waitFor();

        await gotoPath(adminPage, `/${locale}/admin/pros/user_pro_chan`);
        await adminPage
          .getByRole("heading", { name: "陳記冷氣水電" })
          .waitFor();

        await gotoPath(adminPage, `/${locale}/admin/quotes`);
        const quoteRow = adminPage
          .locator("tr", { hasText: requestTitle })
          .first();
        await quoteRow.locator("a").first().click();
        await waitForPath(adminPage, (pathname) =>
          pathname.startsWith(`/${locale}/admin/quotes/`),
        );
      },
    );

    await logStep(
      "admin",
      "Logout",
      "Admin session closed cleanly",
      async () => {
        await logout(adminPage, "/admin");
      },
    );
    await adminContext.close();

    const proDeliveryContext = await browser.newContext();
    const proDeliveryPage = await proDeliveryContext.newPage();

    await logStep(
      "pro",
      "Job status progression",
      "Professional reopened the accepted job and advanced it to completed",
      async () => {
        await login(
          proDeliveryPage,
          "chan@hotfix.hk",
          demoPassword,
          `/${locale}/pro`,
        );
        await gotoPath(proDeliveryPage, `/${locale}/pro/jobs`);
        await clickAndWait(
          proDeliveryPage,
          proDeliveryPage.locator("a", { hasText: requestTitle }).first(),
          `/${locale}/pro/jobs/${created.bookingId}`,
        );
        const bookingStatus = proDeliveryPage.getByLabel("訂單狀態");
        await bookingStatus.selectOption("in_progress");
        await proDeliveryPage.waitForTimeout(700);
        await bookingStatus.selectOption("completed");
        await proDeliveryPage.waitForTimeout(700);
        if ((await bookingStatus.inputValue()) !== "completed") {
          throw new Error("Booking status did not settle on completed.");
        }
      },
    );

    await logStep(
      "pro",
      "Logout after delivery",
      "Professional session closed after delivery updates",
      async () => {
        await logout(proDeliveryPage, "/pro");
      },
    );
    await proDeliveryContext.close();

    const customerFinalContext = await browser.newContext();
    const customerFinalPage = await customerFinalContext.newPage();

    await logStep(
      "customer",
      "Final booking verification",
      "Customer verified completed booking detail and updated notifications",
      async () => {
        await login(
          customerFinalPage,
          "amy@hotfix.hk",
          demoPassword,
          `/${locale}/customer`,
        );
        await gotoPath(
          customerFinalPage,
          `/${locale}/customer/orders/${created.bookingId}`,
        );
        await customerFinalPage.getByText("已完成").first().waitFor();
        await gotoPath(customerFinalPage, `/${locale}/customer/messages`);
        await customerFinalPage
          .getByText("服務請求狀態已更新")
          .first()
          .waitFor();
      },
    );

    await logStep(
      "customer",
      "Final logout",
      "Customer session closed after final verification",
      async () => {
        await logout(customerFinalPage, "/customer");
      },
    );
    await customerFinalContext.close();
  } catch (error) {
    const failureContext = await browser.newContext();
    const failurePage = await failureContext.newPage();
    await failurePage.goto(`${baseUrl}/${locale}`).catch(() => {});
    await failurePage
      .screenshot({
        path: path.join(artifactsDir, `qa-deep-ui-failure-${runId}.png`),
      })
      .catch(() => {});
    await failurePage.close();
    await failureContext.close();
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
      "# Deep UI QA Report",
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
      "| Area | Step | Status | Detail |",
      "| --- | --- | --- | --- |",
      ...results.map(
        (result) =>
          `| ${result.area} | ${result.step} | ${result.status} | ${result.detail.replaceAll("|", "/")} |`,
      ),
      "",
    ].join("\n");

    await writeFile(
      path.join(docsDir, "qa-deep-ui-report.md"),
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

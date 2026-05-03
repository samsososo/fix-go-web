export function getCustomerNav(locale: string, current: string) {
  return [
    {
      href: "/customer",
      label: locale === "en" ? "Dashboard" : "主頁",
      active: current === "dashboard",
    },
    {
      href: "/customer/requests/new",
      label: locale === "en" ? "New request" : "建立請求",
      active: current === "new-request",
    },
    {
      href: "/customer/orders",
      label: locale === "en" ? "Orders" : "訂單",
      active: current === "orders",
    },
    {
      href: "/customer/messages",
      label: locale === "en" ? "Messages" : "訊息中心",
      active: current === "messages",
    },
    {
      href: "/customer/profile",
      label: locale === "en" ? "Profile" : "個人資料",
      active: current === "profile",
    },
  ];
}

export function getProNav(locale: string, current: string) {
  return [
    {
      href: "/pro",
      label: locale === "en" ? "Dashboard" : "主頁",
      active: current === "dashboard",
    },
    {
      href: "/pro/profile",
      label: locale === "en" ? "Profile" : "檔案",
      active: current === "profile",
    },
    {
      href: "/pro/leads",
      label: locale === "en" ? "Leads" : "工作機會",
      active: current === "leads",
    },
    {
      href: "/pro/jobs",
      label: locale === "en" ? "Jobs" : "已接訂單",
      active: current === "jobs",
    },
    {
      href: "/pro/earnings",
      label: locale === "en" ? "Earnings" : "收入",
      active: current === "earnings",
    },
  ];
}

export function getAdminNav(locale: string, current: string) {
  return [
    {
      href: "/admin",
      label: locale === "en" ? "Overview" : "總覽",
      active: current === "dashboard",
    },
    {
      href: "/admin/customers",
      label: locale === "en" ? "Customers" : "客戶",
      active: current === "customers",
    },
    {
      href: "/admin/pros",
      label: locale === "en" ? "Pros" : "師傅",
      active: current === "pros",
    },
    {
      href: "/admin/requests",
      label: locale === "en" ? "Requests" : "服務請求",
      active: current === "requests",
    },
    {
      href: "/admin/quotes",
      label: locale === "en" ? "Quotes" : "報價",
      active: current === "quotes",
    },
  ];
}

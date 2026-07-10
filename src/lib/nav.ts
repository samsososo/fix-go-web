export function getCustomerNav(locale: string, current: string) {
  return [
    {
      href: "/customer",
      label: locale === "en" ? "My requests" : "我的請求",
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
  ];
}

export function getProNav(locale: string, current: string, leadCount?: number) {
  const leadLabel =
    locale === "en"
      ? `Leads${leadCount && leadCount > 0 ? ` · ${leadCount}` : ""}`
      : `工作機會${leadCount && leadCount > 0 ? ` · ${leadCount}` : ""}`;

  return [
    {
      href: "/pro",
      label: locale === "en" ? "Overview" : "總覽",
      active: current === "dashboard",
    },
    {
      href: "/pro/leads",
      label: leadLabel,
      active: current === "leads",
    },
    {
      href: "/pro/calendar",
      label: locale === "en" ? "Schedule" : "日程",
      active: current === "calendar",
    },
    {
      href: "/pro/jobs",
      label: locale === "en" ? "Jobs" : "已接訂單",
      active: current === "jobs",
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
    {
      href: "/admin/calendar",
      label: locale === "en" ? "Calendar" : "排程",
      active: current === "calendar",
    },
  ];
}

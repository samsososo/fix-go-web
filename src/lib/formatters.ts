import {
  BookingStatus,
  QuoteStatus,
  RequestStatus,
  RequestUrgency,
  VerificationStatus,
} from "@/types/domain";

export function formatHongKongPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 8) {
    return phone;
  }

  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

export function formatWhatsAppUrl(phone: string | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const whatsappPhone =
    digits.length === 8
      ? `852${digits}`
      : digits.length === 11 && digits.startsWith("852")
        ? digits
        : "";

  return whatsappPhone ? `https://wa.me/${whatsappPhone}` : undefined;
}

export function formatUrgencyLabel(urgency: RequestUrgency, locale: string) {
  if (locale === "en") {
    return {
      asap: "ASAP",
      today: "Today",
      tomorrow: "Tomorrow",
      scheduled: "Scheduled",
    }[urgency];
  }

  return {
    asap: "盡快",
    today: "今天",
    tomorrow: "明天",
    scheduled: "預約時間",
  }[urgency];
}

export function formatDateTime(value: string | undefined, locale: string) {
  if (!value) {
    return locale === "en" ? "Not set" : "未設定";
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-HK" : "zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDurationMinutes(
  minutes: number | undefined,
  locale: string,
) {
  if (!minutes) {
    return locale === "en" ? "Not set" : "未設定";
  }

  if (minutes < 60) {
    return locale === "en" ? `${minutes} min` : `${minutes} 分鐘`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return locale === "en" ? `${hours}h` : `${hours} 小時`;
  }

  return locale === "en"
    ? `${hours}h ${remainingMinutes}m`
    : `${hours} 小時 ${remainingMinutes} 分鐘`;
}

export function formatStatusLabel(
  status: RequestStatus | QuoteStatus | BookingStatus | VerificationStatus,
  locale: string,
) {
  const labels =
    locale === "en"
      ? {
          draft: "Draft",
          submitted: "Submitted",
          awaiting_quotes: "Awaiting quotes",
          quoted: "Quoted",
          accepted: "Accepted",
          scheduled: "Scheduled",
          in_progress: "In progress",
          completed: "Completed",
          cancelled: "Cancelled",
          sent: "Sent",
          rejected: "Rejected",
          expired: "Expired",
          quote_sent: "Quote sent",
          unverified: "Unverified",
          pending: "Pending review",
          verified: "Verified",
        }
      : {
          draft: "草稿",
          submitted: "已提交",
          awaiting_quotes: "等待報價",
          quoted: "已有報價",
          accepted: "已接受",
          scheduled: "已安排",
          in_progress: "進行中",
          completed: "已完成",
          cancelled: "已取消",
          sent: "已送出",
          rejected: "已拒絕",
          expired: "已失效",
          quote_sent: "已送出報價",
          unverified: "未驗證",
          pending: "審核中",
          verified: "已驗證",
        };

  return labels[status];
}

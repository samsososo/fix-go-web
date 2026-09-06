import { formatHongKongPhone } from "@/lib/formatters";

export type WorkContactPhone = {
  phone: string;
  label: string;
  whatsapp: boolean;
};

const contactCue =
  /電話|电話|电话|聯絡|聯繫|联系|聯係|致電|致电|手機|手机|(?<![a-z])(?:tel(?:ephone)?|phone|contact|call|whats?\s*app|wtsapp|wts|wst|ws|wa)(?![a-z])/giu;
const whatsappCue =
  /(?<![a-z])(?:whats?\s*app|wtsapp|wts|wst|ws|wa)(?![a-z])/iu;
const moneyCue =
  /[$＄]|(?:HKD|人工|薪|工資|工资|價|价|預算|预算|salary|wage)/iu;

function normalizePhone(value: string, requireCountryCode = false) {
  if (!/^[+\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "").replace(/^00852/, "852");
  if (/^852[2356789]\d{7}$/.test(digits)) return `+${digits}`;
  if (
    !requireCountryCode &&
    !value.includes("+") &&
    /^[2356789]\d{7}$/.test(digits)
  ) {
    return `+852${digits}`;
  }
  return null;
}

function phoneFromWhatsAppUrl(value: string) {
  try {
    const url = new URL(
      /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`,
    );
    if (url.username || url.password) return null;
    if (url.hostname === "wa.me" && /^\/\d+\/?$/.test(url.pathname)) {
      return normalizePhone(url.pathname.replace(/\//g, ""), true);
    }
    if (
      ((["api.whatsapp.com", "web.whatsapp.com", "whatsapp.com"].includes(
        url.hostname,
      ) &&
        url.pathname === "/send") ||
        (url.protocol === "whatsapp:" && url.hostname === "send")) &&
      url.searchParams.has("phone")
    ) {
      return normalizePhone(url.searchParams.get("phone") ?? "", true);
    }
  } catch {
    // A malformed source URL is not a contact route.
  }
  return null;
}

/** Pass the reviewed original post body, never a feed container or comments. */
export function extractWorkContactPhones(text: string): WorkContactPhone[] {
  const contacts = new Map<string, WorkContactPhone>();
  const add = (phone: string, whatsapp: boolean) => {
    const existing = contacts.get(phone);
    contacts.set(phone, {
      phone,
      label: formatHongKongPhone(phone.slice(4)),
      whatsapp: whatsapp || existing?.whatsapp === true,
    });
  };
  const body = text
    .normalize("NFKC")
    .replace(/[\u034f\u200b-\u200f\u2060\ufeff]/g, "")
    .split(
      /\n(?:Comments|All comments|Most relevant|留言)(?:\s*[:：])?\s*\n|\nComment as /i,
    )[0];
  const withoutUrls = body.replace(
    /(?:https?:\/\/|whatsapp:\/\/|(?:wa\.me|(?:api\.|web\.)?whatsapp\.com)\/)[^\s<>"'，。]+/giu,
    (value) => {
      const phone = phoneFromWhatsAppUrl(value.replace(/[),.;!?]+$/, ""));
      if (phone) add(phone, true);
      return " ".repeat(value.length);
    },
  );

  let previous: { end: number; whatsapp: boolean } | undefined;
  for (const match of withoutUrls.matchAll(
    /(?<![\d+])\+?\d(?:[ \t().-]*\d){7,15}(?!\d)/gu,
  )) {
    const value = match[0];
    const start = match.index;
    const end = start + value.length;
    const phone = normalizePhone(value);
    if (!phone || /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value)) continue;

    const prefix = withoutUrls.slice(Math.max(0, start - 40), start);
    const suffix = withoutUrls.slice(end, end + 24);
    const cues = [...prefix.matchAll(contactCue)];
    const cue = cues.at(-1);
    const gap = cue ? prefix.slice(cue.index + cue[0].length) : "";
    const whatsappBefore = cues.some(
      (candidate) =>
        whatsappCue.test(candidate[0]) &&
        /^[\s:：/／、()（）]*$/.test(
          prefix
            .slice(candidate.index + candidate[0].length, cue!.index)
            .replace(contactCue, ""),
        ),
    );
    const before =
      !!cue &&
      gap.length <= 24 &&
      !/[\d。.!?]/.test(gap) &&
      !moneyCue.test(gap);
    const after =
      /^\s*[（(]?(?:whats?\s*app|wtsapp|wts|wst|ws|wa|電話|电话|tel|phone)[）)]?(?:\s*$|[，,。;；])/iu.test(
        suffix,
      );
    const listed =
      previous &&
      /^[\s、,/／&或及]+$/.test(withoutUrls.slice(previous.end, start));
    if (
      (!before && !after && !listed) ||
      /[$＄]\s*$/.test(prefix) ||
      /^\s*(?:元|蚊|港元)/.test(suffix)
    )
      continue;
    const whatsapp =
      (before && whatsappBefore) ||
      (after && whatsappCue.test(suffix)) ||
      (!!listed && previous!.whatsapp);
    add(phone, whatsapp);
    previous = { end, whatsapp };
  }
  return [...contacts.values()];
}

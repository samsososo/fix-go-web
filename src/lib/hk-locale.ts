import {
  hongKongAreaNamesZh,
  hongKongDistrictNamesZh,
} from "@/lib/hk-service-areas";

export function formatDistrictName(district: string, locale: string) {
  return locale === "en"
    ? district
    : (hongKongDistrictNamesZh[district] ?? district);
}

export function formatAreaName(area: string, locale: string) {
  return locale === "en" ? area : (hongKongAreaNamesZh[area] ?? area);
}

export function formatDistrictList(districts: string[], locale: string) {
  return districts.map((district) => formatDistrictName(district, locale));
}

const districtZh: Record<string, string> = {
  "Central and Western": "中西區",
  "Wan Chai": "灣仔",
  Eastern: "東區",
  "Kwun Tong": "觀塘",
  "Wong Tai Sin": "黃大仙",
  "Sha Tin": "沙田",
  "Tsuen Wan": "荃灣",
  "Yuen Long": "元朗",
};

const areaZh: Record<string, string> = {
  Central: "中環",
  "Sheung Wan": "上環",
  "Sai Ying Pun": "西營盤",
  "Wan Chai": "灣仔",
  "Causeway Bay": "銅鑼灣",
  "Happy Valley": "跑馬地",
  "Quarry Bay": "鰂魚涌",
  "Tai Koo": "太古",
  "Chai Wan": "柴灣",
  "Kwun Tong": "觀塘",
  "Lam Tin": "藍田",
  "Yau Tong": "油塘",
  "Diamond Hill": "鑽石山",
  "San Po Kong": "新蒲崗",
  "Chuk Yuen": "竹園",
  "Sha Tin": "沙田",
  "Ma On Shan": "馬鞍山",
  "Fo Tan": "火炭",
  "Tsuen Wan": "荃灣",
  "Kwai Fong": "葵芳",
  "Tsing Yi": "青衣",
  "Yuen Long": "元朗",
  "Tin Shui Wai": "天水圍",
  "Hung Shui Kiu": "洪水橋",
};

export function formatDistrictName(district: string, locale: string) {
  return locale === "en" ? district : (districtZh[district] ?? district);
}

export function formatAreaName(area: string, locale: string) {
  return locale === "en" ? area : (areaZh[area] ?? area);
}

export function formatDistrictList(districts: string[], locale: string) {
  return districts.map((district) => formatDistrictName(district, locale));
}

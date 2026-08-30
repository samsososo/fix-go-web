import type { DistrictAreaSeed } from "@/types/domain";

type ServiceAreaDefinition = {
  district: string;
  districtZh: string;
  areas: readonly { value: string; zh: string }[];
};

const serviceAreaDefinitions: readonly ServiceAreaDefinition[] = [
  {
    district: "Central and Western",
    districtZh: "中西區",
    areas: [
      { value: "Central", zh: "中環" },
      { value: "Admiralty", zh: "金鐘" },
      { value: "Sheung Wan", zh: "上環" },
      { value: "Sai Ying Pun", zh: "西營盤" },
      { value: "Shek Tong Tsui", zh: "石塘咀" },
      { value: "Kennedy Town", zh: "堅尼地城" },
      { value: "Mid-Levels", zh: "半山" },
      { value: "The Peak", zh: "山頂" },
    ],
  },
  {
    district: "Eastern",
    districtZh: "東區",
    areas: [
      { value: "Fortress Hill", zh: "炮台山" },
      { value: "North Point", zh: "北角" },
      { value: "Quarry Bay", zh: "鰂魚涌" },
      { value: "Tai Koo", zh: "太古" },
      { value: "Sai Wan Ho", zh: "西灣河" },
      { value: "Shau Kei Wan", zh: "筲箕灣" },
      { value: "Heng Fa Chuen", zh: "杏花邨" },
      { value: "Chai Wan", zh: "柴灣" },
      { value: "Siu Sai Wan", zh: "小西灣" },
    ],
  },
  {
    district: "Southern",
    districtZh: "南區",
    areas: [
      { value: "Aberdeen", zh: "香港仔" },
      { value: "Ap Lei Chau", zh: "鴨脷洲" },
      { value: "Wong Chuk Hang", zh: "黃竹坑" },
      { value: "Pok Fu Lam", zh: "薄扶林" },
      { value: "Wah Fu", zh: "華富" },
      { value: "Tin Wan", zh: "田灣" },
      { value: "Stanley", zh: "赤柱" },
      { value: "Repulse Bay", zh: "淺水灣" },
      { value: "Deep Water Bay", zh: "深水灣" },
    ],
  },
  {
    district: "Wan Chai",
    districtZh: "灣仔區",
    areas: [
      { value: "Wan Chai", zh: "灣仔" },
      { value: "Causeway Bay", zh: "銅鑼灣" },
      { value: "Happy Valley", zh: "跑馬地" },
      { value: "Tai Hang", zh: "大坑" },
      { value: "Jardine's Lookout", zh: "渣甸山" },
    ],
  },
  {
    district: "Kowloon City",
    districtZh: "九龍城區",
    areas: [
      { value: "Kowloon City", zh: "九龍城" },
      { value: "Kowloon Tong", zh: "九龍塘" },
      { value: "Ho Man Tin", zh: "何文田" },
      { value: "Hung Hom", zh: "紅磡" },
      { value: "To Kwa Wan", zh: "土瓜灣" },
      { value: "Ma Tau Wai", zh: "馬頭圍" },
      { value: "Ma Tau Kok", zh: "馬頭角" },
      { value: "Kai Tak", zh: "啟德" },
    ],
  },
  {
    district: "Yau Tsim Mong",
    districtZh: "油尖旺區",
    areas: [
      { value: "Tsim Sha Tsui", zh: "尖沙咀" },
      { value: "Jordan", zh: "佐敦" },
      { value: "Yau Ma Tei", zh: "油麻地" },
      { value: "Mong Kok", zh: "旺角" },
      { value: "Tai Kok Tsui", zh: "大角咀" },
      { value: "West Kowloon", zh: "西九龍" },
    ],
  },
  {
    district: "Sham Shui Po",
    districtZh: "深水埗區",
    areas: [
      { value: "Sham Shui Po", zh: "深水埗" },
      { value: "Cheung Sha Wan", zh: "長沙灣" },
      { value: "Lai Chi Kok", zh: "荔枝角" },
      { value: "Mei Foo", zh: "美孚" },
      { value: "Shek Kip Mei", zh: "石硤尾" },
      { value: "Yau Yat Chuen", zh: "又一村" },
    ],
  },
  {
    district: "Wong Tai Sin",
    districtZh: "黃大仙區",
    areas: [
      { value: "Wong Tai Sin", zh: "黃大仙" },
      { value: "Diamond Hill", zh: "鑽石山" },
      { value: "San Po Kong", zh: "新蒲崗" },
      { value: "Lok Fu", zh: "樂富" },
      { value: "Tsz Wan Shan", zh: "慈雲山" },
      { value: "Chuk Yuen", zh: "竹園" },
      { value: "Ngau Chi Wan", zh: "牛池灣" },
    ],
  },
  {
    district: "Kwun Tong",
    districtZh: "觀塘區",
    areas: [
      { value: "Kwun Tong", zh: "觀塘" },
      { value: "Ngau Tau Kok", zh: "牛頭角" },
      { value: "Kowloon Bay", zh: "九龍灣" },
      { value: "Lam Tin", zh: "藍田" },
      { value: "Yau Tong", zh: "油塘" },
      { value: "Sau Mau Ping", zh: "秀茂坪" },
      { value: "Shun Lee", zh: "順利" },
    ],
  },
  {
    district: "Tai Po",
    districtZh: "大埔區",
    areas: [
      { value: "Tai Po", zh: "大埔" },
      { value: "Tai Wo", zh: "太和" },
      { value: "Tai Mei Tuk", zh: "大美督" },
      { value: "Lam Tsuen", zh: "林村" },
      { value: "Hong Lok Yuen", zh: "康樂園" },
      { value: "Science Park", zh: "科學園" },
    ],
  },
  {
    district: "Yuen Long",
    districtZh: "元朗區",
    areas: [
      { value: "Yuen Long", zh: "元朗" },
      { value: "Tin Shui Wai", zh: "天水圍" },
      { value: "Hung Shui Kiu", zh: "洪水橋" },
      { value: "Ping Shan", zh: "屏山" },
      { value: "Kam Tin", zh: "錦田" },
      { value: "Pat Heung", zh: "八鄉" },
      { value: "San Tin", zh: "新田" },
      { value: "Lok Ma Chau", zh: "落馬洲" },
    ],
  },
  {
    district: "Tuen Mun",
    districtZh: "屯門區",
    areas: [
      { value: "Tuen Mun", zh: "屯門" },
      { value: "Siu Hong", zh: "兆康" },
      { value: "Sam Shing", zh: "三聖" },
      { value: "So Kwun Wat", zh: "掃管笏" },
      { value: "Gold Coast", zh: "黃金海岸" },
      { value: "Lung Kwu Tan", zh: "龍鼓灘" },
    ],
  },
  {
    district: "North",
    districtZh: "北區",
    areas: [
      { value: "Sheung Shui", zh: "上水" },
      { value: "Fanling", zh: "粉嶺" },
      { value: "Sha Tau Kok", zh: "沙頭角" },
      { value: "Ta Kwu Ling", zh: "打鼓嶺" },
      { value: "Kwu Tung", zh: "古洞" },
    ],
  },
  {
    district: "Sai Kung",
    districtZh: "西貢區",
    areas: [
      { value: "Tseung Kwan O", zh: "將軍澳" },
      { value: "Hang Hau", zh: "坑口" },
      { value: "Tiu Keng Leng", zh: "調景嶺" },
      { value: "LOHAS Park", zh: "日出康城" },
      { value: "Sai Kung Town", zh: "西貢市" },
      { value: "Clear Water Bay", zh: "清水灣" },
    ],
  },
  {
    district: "Sha Tin",
    districtZh: "沙田區",
    areas: [
      { value: "Sha Tin", zh: "沙田" },
      { value: "Tai Wai", zh: "大圍" },
      { value: "Fo Tan", zh: "火炭" },
      { value: "Ma On Shan", zh: "馬鞍山" },
      { value: "Siu Lek Yuen", zh: "小瀝源" },
      { value: "Shek Mun", zh: "石門" },
      { value: "Wu Kai Sha", zh: "烏溪沙" },
    ],
  },
  {
    district: "Tsuen Wan",
    districtZh: "荃灣區",
    areas: [
      { value: "Tsuen Wan", zh: "荃灣" },
      { value: "Tsuen King Circuit", zh: "荃景圍" },
      { value: "Sham Tseng", zh: "深井" },
      { value: "Ting Kau", zh: "汀九" },
      { value: "Ma Wan", zh: "馬灣" },
    ],
  },
  {
    district: "Kwai Tsing",
    districtZh: "葵青區",
    areas: [
      { value: "Kwai Chung", zh: "葵涌" },
      { value: "Kwai Fong", zh: "葵芳" },
      { value: "Kwai Hing", zh: "葵興" },
      { value: "Lai King", zh: "荔景" },
      { value: "Tsing Yi", zh: "青衣" },
    ],
  },
  {
    district: "Islands",
    districtZh: "離島區",
    areas: [
      { value: "Tung Chung", zh: "東涌" },
      { value: "Discovery Bay", zh: "愉景灣" },
      { value: "Mui Wo", zh: "梅窩" },
      { value: "Tai O", zh: "大澳" },
      { value: "Cheung Chau", zh: "長洲" },
      { value: "Peng Chau", zh: "坪洲" },
      { value: "Lamma Island", zh: "南丫島" },
      { value: "Airport", zh: "機場" },
    ],
  },
];

export const hongKongDistrictNamesZh = Object.fromEntries(
  serviceAreaDefinitions.map((definition) => [
    definition.district,
    definition.districtZh,
  ]),
) as Record<string, string>;

export const hongKongAreaNamesZh = Object.fromEntries(
  serviceAreaDefinitions.flatMap((definition) =>
    definition.areas.map((area) => [area.value, area.zh]),
  ),
) as Record<string, string>;

export function createHongKongServiceAreas(): DistrictAreaSeed[] {
  return serviceAreaDefinitions.map((definition) => ({
    district: definition.district,
    areas: definition.areas.map((area) => area.value),
  }));
}

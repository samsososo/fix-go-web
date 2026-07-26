import Image from "next/image";

import { cn } from "@/lib/utils";

const LOGOS = {
  en: {
    src: "/hotfix_eng_logo.png",
    alt: "Hotfix",
    width: 784,
    height: 744,
  },
  "zh-HK": {
    src: "/hotfix24_chinese_logo.png",
    alt: "快修24",
    width: 1083,
    height: 403,
  },
} as const;

export function BrandLogo({
  variant = "primary",
  className,
  priority = false,
}: {
  variant?: "primary" | "english";
  className?: string;
  priority?: boolean;
}) {
  const logo = variant === "english" ? LOGOS.en : LOGOS["zh-HK"];

  return (
    <Image
      src={logo.src}
      alt={logo.alt}
      width={logo.width}
      height={logo.height}
      className={cn("h-auto w-auto object-contain", className)}
      priority={priority}
    />
  );
}

import { createElement, type ComponentProps } from "react";
import { createNavigation } from "next-intl/navigation";

import { routing } from "@/i18n/routing";

const navigation = createNavigation(routing);
const IntlLink = navigation.Link;

type LinkProps = ComponentProps<typeof IntlLink>;

export function Link({ locale: _locale, ...props }: LinkProps) {
  void _locale;
  return createElement(IntlLink, props);
}

export const { redirect, usePathname, useRouter, getPathname } = navigation;

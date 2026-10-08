/**
 * Menu API methods
 */

import type { CockpitAsset } from "./assets.ts";
import { get, legacyLocale, segment, type MethodContext } from "./context.ts";

export interface MenuQueryOptions {
  inactive?: boolean;
  locale?: string;
}

export interface CockpitMenuUrl {
  route: string;
  locale: string;
}

export interface CockpitMenuLink {
  active: boolean;
  title: string;
  url: string | CockpitMenuUrl;
  target?: string;
  data?: {
    image?: CockpitAsset | null;
    [key: string]: unknown;
  };
  children?: CockpitMenuLink[];
  meta?: { key: string; value: string }[] | Record<string, string>;
}

export interface CockpitMenu {
  _id: string;
  name: string;
  label: string;
  info?: string;
  group?: string;
  color?: string;
  links: CockpitMenuLink[];
}

export interface MenuMethods {
  pagesMenus<T = CockpitMenu>(options?: MenuQueryOptions): Promise<T[] | null>;
  pagesMenu<T = CockpitMenu>(
    name: string,
    options?: MenuQueryOptions,
  ): Promise<T | null>;
}

export function createMenuMethods(ctx: MethodContext): MenuMethods {
  return {
    async pagesMenus<T = CockpitMenu>(
      options: MenuQueryOptions = {},
    ): Promise<T[] | null> {
      const { locale, inactive } = legacyLocale(options, "pagesMenus(locale)");
      return get<T[]>(ctx, "/pages/menus", { locale, query: { inactive } });
    },

    async pagesMenu<T = CockpitMenu>(
      name: string,
      options: MenuQueryOptions = {},
    ): Promise<T | null> {
      const { locale, inactive } = legacyLocale(
        options,
        "pagesMenu(name, locale)",
      );
      return get<T>(ctx, `/pages/menu/${segment(name, "menu name")}`, {
        locale,
        query: { inactive },
      });
    },
  };
}

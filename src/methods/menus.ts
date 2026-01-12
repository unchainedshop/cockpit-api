/**
 * Menu API methods
 */

import type { MethodContext } from "./content.ts";
import type { CockpitAsset } from "./assets.ts";

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
  pagesMenus<T = CockpitMenu>(
    options?: MenuQueryOptions | string,
  ): Promise<T[] | null>;
  pagesMenu<T = CockpitMenu>(
    name: string,
    options?: MenuQueryOptions | string,
  ): Promise<T | null>;
}

export function createMenuMethods(ctx: MethodContext): MenuMethods {
  return {
    async pagesMenus<T = CockpitMenu>(
      options: MenuQueryOptions | string = "default",
    ): Promise<T[] | null> {
      const opts = typeof options === "string" ? { locale: options } : options;
      const { locale = "default", inactive } = opts;
      const url = ctx.url.build("/pages/menus", {
        locale,
        queryParams: { inactive },
      });
      return ctx.http.fetch<T[]>(url);
    },

    async pagesMenu<T = CockpitMenu>(
      name: string,
      options: MenuQueryOptions | string = "default",
    ): Promise<T | null> {
      const opts = typeof options === "string" ? { locale: options } : options;
      const { locale = "default", inactive } = opts;
      const url = ctx.url.build(`/pages/menu/${name}`, {
        locale,
        queryParams: { inactive },
      });
      return ctx.http.fetch<T>(url);
    },
  };
}

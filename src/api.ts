import { print } from "graphql";
import { logger } from "./cockpit-logger.js";
import { LRUCache } from 'lru-cache'
const { COCKPIT_GRAPHQL_ENDPOINT = '', COCKPIT_CACHE__MAX_LIMIT = '', COCKPIT_CACHE_TTL = '' } = process.env;
const dataCache = new LRUCache({
  max: COCKPIT_CACHE__MAX_LIMIT ? parseInt(COCKPIT_CACHE__MAX_LIMIT, 10) : 100,
  ttl: COCKPIT_CACHE_TTL ? parseInt(COCKPIT_CACHE_TTL, 10) : 100000,
  allowStale: false,
});



export enum ImageSizeMode {
  Thumbnail = 'thumbnail',
  BestFit = 'bestFit',
  Resize = 'resize',
  FitToWidth = 'fitToWidth',
  FitToHeight = 'fitToHeight',
}
export enum MimeType {
  AUTO = 'auto',
  GIF = 'gif',
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  BMP = 'bmp'
}

const cockpitURL = new URL(COCKPIT_GRAPHQL_ENDPOINT);

export const getTenantIds = () => {
  const env = { ...process.env };
  const cockpitSecretKeys = Object.keys(env).filter(
    (key) =>
      key.includes("COCKPIT_SECRET") &&
      key !== "COCKPIT_SECRET" &&
      !key.endsWith("_FILE"),
  );

  const tenantIds = cockpitSecretKeys.map((key) => {
    return key.slice("COCKPIT_SECRET_".length).toLowerCase();
  });

  return tenantIds;
};

export const generateCmsRouteReplacements = async (tenant?: string) => {
  const cachedReplacement = dataCache.get(`ROUTE_REPLACEMENT_MAP${tenant}`);
  if (cachedReplacement) return cachedReplacement;
  const filterParams = {
    fields: JSON.stringify({ _id: 1, slug: 1, _r: 1 }),
  };
  const cmsPages = await fetch(
    `${cockpitURL.origin}${tenant ? `/:${tenant}/api` : "/api"}/pages/pages?${new URLSearchParams(
      filterParams,
    ).toString()}`,
  );
  const pagesArr: any[] = (await cmsPages.json()) || [] as any;

  const replacement = pagesArr.reduce((result, item) => {
    const key = `pages://${item._id}`;
    const value = item._r;
    return { ...result, [key]: value };
  }, {});
  dataCache.set(`ROUTE_REPLACEMENT_MAP${tenant}`, replacement);
  return replacement;
};

export const generateCollectionAndSingletonSlugRouteMap = async (tenant?: string) => {
  const cacheKey = `SLUG_ROUTE_MAP_${tenant}`;
  const cachedMap = dataCache.get(cacheKey);
  if (cachedMap) return cachedMap;
  const filterParams = {
    fields: JSON.stringify({
      data: { collection: 1, singleton: 1 },
      _r: 1,
      type: 1,
    }),
    filter: JSON.stringify({ 'data.collection': { $ne: null } }),
  };

  const cmsPages = await fetch(
    `${cockpitURL.origin}${tenant ? `/:${tenant}/api` : "/api"}/pages/pages?locale=default&${new URLSearchParams(filterParams).toString()}`,
  );
  const pagesArr: any[] = (await cmsPages.json()) || [] as any;
  const pageMap = pagesArr.reduce((result, { data, _r }) => {
    const entityName = data?.collection || data?.singleton;
    if (!entityName) return result;
    return { ...result, [entityName]: _r };
  }, {});
  dataCache.set(cacheKey, pageMap);
  return pageMap;
};

export const FixImagePaths = (replacements: any, tenant?: string) => {
  const pattern = new RegExp(Object.keys(replacements).join("|"), "g");
  const url = `${cockpitURL.origin}${tenant ? `/:${tenant}` : ""}`;
  return {
    transformResult(originalResponse: any) {
      try {
        const rawResponseDataString = JSON.stringify(originalResponse);
        const fixedDataString = rawResponseDataString
          // fixes asset paths
          .replace(/"path":"\//g, `"path":"${url}/storage/uploads/`)
          .replace(/src=\\"(\/\:[^:]+\/)?storage/gi, `src=\\"${cockpitURL.origin}/$1storage`)
          .replace(/href=\\"(\/\:[^:]+\/)?storage/gi, `href=\\"${cockpitURL.origin}/$1storage`)
          .replace(pattern, (match) => replacements[match])
          // fixes image paths which already had a path including storage/uploads
          .replace(/\/storage\/uploads\/storage\/uploads\//g, `/storage/uploads/`);
        return JSON.parse(fixedDataString);
      } catch (e) {
        return originalResponse;
      }
    },
  };
};

const encodeQueryParam = (key: string, value: any) => {
  return `${encodeURIComponent(key)}=${encodeURIComponent(typeof value !== "string" ? JSON.stringify(value) : value)}`;
};

const buildQueryString = (params: any) => {
  if (!Object.keys(params).length) return null;
  return Object.entries(params)
    .map(([key, value]) => encodeQueryParam(key, value))
    .join("&");
};

const handleErrorAndLog = (e: Error) => {
  logger.error('Cockpit API Error', e);
  return null;
};

export const CockpitAPI = async (tenant?: string) => {
  if (!COCKPIT_GRAPHQL_ENDPOINT) throw Error("COCKPIT_GRAPHQL_ENDPOINT is not set")


  const buildUrl = (path: string, { locale = "de", queryParams = {} } = {}) => {
    const normalizedLocale = locale === "de" ? "default" : locale;
    const url = new URL(cockpitURL);
    url.pathname = `${tenant ? `/:${tenant}/api` : "/api"}${path}`;
    const queryString = buildQueryString({
      ...queryParams,
      locale: normalizedLocale,
    });
    url.search = queryString as string;
    return url;
  };

  const routeReplaceMents = await generateCmsRouteReplacements(tenant);
  const { transformResult } = FixImagePaths(routeReplaceMents, tenant);

  const handleResponse = async (result: any) => {
    if (result.status === 404) return null;
    if (result.status !== 200) {
      logger.error(`Error accessing ${result.url}`, result);
      throw new Error(
        `Cockpit: Error accessing ${result.url} ${await result.text()}`,
      );
    }
    return transformResult(await result.json());
  };

  const fetchData = async (url: any, { useAdminAccess, ...options }: any = {}) => {
    const headers = options?.headers ?? {};

    if (useAdminAccess) {
      const secretName = ["COCKPIT_SECRET", tenant].filter(Boolean).join("_");
      const token = process.env[secretName];
      headers["API-Key"] = token;
    }

    try {
      logger.verbose(`Requesting ${url}`);
      const result = await fetch(url, {
        ...options,
        headers: {
          ...headers,
        },
      });
      return handleResponse(result);
    } catch (e: any) {
      return handleErrorAndLog(e);
    }
  };

  return {
    async graphQL(document: any, variables: any) {
      const query = print(document);
      const cockpitEndpointUrl = new URL(COCKPIT_GRAPHQL_ENDPOINT);
      if (tenant) {
        cockpitEndpointUrl.pathname = `/:${tenant}${cockpitEndpointUrl.pathname}`;
      }
      return fetchData(cockpitEndpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    },

    async getContentItem(
      { model, id }: { model: string; id?: string },
      locale = "default",
      queryParams = {},
      { useAdminAccess = false }: { useAdminAccess?: boolean } = {},
    ) {
      if (!model) throw new Error("Cockpit: Please provide a model");

      const url = buildUrl(`/content/item/${model}${id ? `/${id}` : ""}`, {
        locale,
        queryParams,
      });
      return fetchData(url, { useAdminAccess });
    },

    async getAggregateModel({ model, pipeline }: { model: string, pipeline: any[] }, locale = "default") {
      if (!model) throw new Error("Cockpit: Please provide a model");

      const url = buildUrl(`/content/aggregate/${model}`, {
        locale,
        queryParams: {
          pipeline,
        },
      });
      return fetchData(url);
    },

    async getContentItems(model: string, locale = "default", queryParams: any = {}) {
      if (!model) throw new Error("Cockpit: Please provide a model");
      const url = buildUrl(`/content/items/${model}`, {
        locale,
        queryParams,
      });
      return fetchData(url);
    },

    async getContentTree(
      model: string,
      locale = "default",
      queryParams = { filter: {} },
    ) {
      if (!model) throw new Error("Cockpit: Please provide a model");
      const url = buildUrl(`/content/tree/${model}`, {
        locale,
        queryParams,
      });
      return fetchData(url);
    },

    async postContentItem(model: string, item: any) {
      if (!model) throw new Error("Cockpit: Please provide a model");
      const url = buildUrl(`/content/item/${model}`, {});
      return fetchData(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: item }),
      });
    },
    async deleteContentItem(model: string, id?: string) {
      if (!model || !id)
        throw new Error("Cockpit: Please provide a model and id");
      const url = buildUrl(`/content/item/${model}/${id}`, {});
      return fetchData(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    },

    async pages(locale = "default", queryParams = {}) {
      const url = buildUrl("/pages/pages", {
        locale,
        queryParams,
      });
      return fetchData(url);
    },

    async pageById({ page, id }: { page: string; id: string }, locale = "default", queryParams = {}) {
      if (!page || !id)
        throw new Error("GetCockpit: Please provide a page and id");
      const url = buildUrl(`/pages/page/${page}/${id}`, {
        locale,
        queryParams,
      });
      return fetchData(url);
    },

    async pageByRoute(route: string, locale = "default") {
      const url = buildUrl("/pages/page", {
        locale,
        queryParams: { route },
      });
      return fetchData(url);
    },

    async pagesMenus(locale = "default") {
      const url = buildUrl("/pages/menus", { locale });
      return fetchData(url);
    },

    async pagesMenu(name: string, locale = "default") {
      const url = buildUrl(`/pages/menu/${name}`, { locale });
      return fetchData(url);
    },

    async pagesRoutes(locale = "default") {
      const url = buildUrl("/pages/routes", { locale });
      return fetchData(url);
    },

    async pagesSitemap() {
      const url = buildUrl("/pages/sitemap", {});
      return fetchData(url);
    },
    async pagesSetting(locale = "default") {
      const url = buildUrl("/pages/settings", { locale });
      return fetchData(url);
    },
    async healthCheck() {
      const url = buildUrl("/system/healthcheck");
      return fetchData(url);
    },
    async lokalize(projectName: string, locale = "default", nested = null) {
      if (!projectName)
        throw new Error("GetCockpit: Please provide projectName");
      const url = buildUrl(`/lokalize/project/${projectName}`, { locale, queryParams: { nested } });
      return fetchData(url);
    },
    async assetById(assetId: string) {
      if (!assetId)
        throw new Error("GetCockpit: Please provide assetId");
      const url = buildUrl(`/assets/${assetId}`);
      return fetchData(url);
    },
    async imageAssetById(assetId: string, queryParams?: { m?: ImageSizeMode; w?: number; h?: number; q?: number; mime?: MimeType; re?: number; t?: string; o?: number; }) {
      if (!assetId)
        throw new Error("GetCockpit: Please provide assetId");
      const url = buildUrl(`/assets/image/${assetId}`, { queryParams });
      return fetchData(url);
    },
    async getFullRouteForSlug(slug: string) {
      const routeSlugMap =
        await generateCollectionAndSingletonSlugRouteMap(tenant);
      return routeSlugMap?.[slug];
    },
  };
};

/**
 * Asset API methods
 */

import { requireParam } from "../core/url.ts";
import { get, segment, type MethodContext } from "./context.ts";

export interface CockpitAsset {
  _id: string;
  path: string;
  title: string;
  mime: string;
  type: "image" | "video" | "audio" | "document" | "archive" | "code" | "other";
  description?: string;
  tags?: string[];
  size: number;
  colors?: string[] | null;
  width?: number | null;
  height?: number | null;
  _hash: string;
  _created: number;
  _modified: number;
  _cby?: string;
  _mby?: string;
  altText?: string;
  thumbhash?: string;
  folder?: string;
}

export enum ImageSizeMode {
  Thumbnail = "thumbnail",
  BestFit = "bestFit",
  Resize = "resize",
  FitToWidth = "fitToWidth",
  FitToHeight = "fitToHeight",
}

export enum MimeType {
  AUTO = "auto",
  GIF = "gif",
  JPEG = "jpeg",
  PNG = "png",
  WEBP = "webp",
  BMP = "bmp",
}

/** Image transformation parameters; Cockpit requires `w` or `h` (400 otherwise) */
export type ImageAssetQueryParams = {
  m?: ImageSizeMode;
  q?: number;
  mime?: MimeType;
  t?: string;
} & ({ w: number; h?: number } | { w?: number; h: number });

export interface UploadAssetsOptions {
  /** Target folder name */
  folder?: string;
}

export interface UploadAssetsResponse {
  assets: CockpitAsset[];
}

export interface AssetMethods {
  assetById<T = CockpitAsset>(assetId: string): Promise<T | null>;
  /**
   * URL of a generated image (Cockpit answers with plain text). URLs on the
   * endpoint's origin get the same base URL as asset paths in JSON responses
   * (`publicUrl` / `relativeAssetPaths`); other hosts are returned as-is.
   */
  imageAssetById(
    assetId: string,
    queryParams: ImageAssetQueryParams,
  ): Promise<string | null>;
  /** Uploads files (Unchained module, always admin access: assets/upload) */
  uploadAssets(
    files: File[],
    options?: UploadAssetsOptions,
  ): Promise<UploadAssetsResponse | null>;
}

export function createAssetMethods(ctx: MethodContext): AssetMethods {
  const { endpoint, publicUrl, relativeAssetPaths } = ctx.config;
  const assetBaseUrl = relativeAssetPaths ? "" : publicUrl;

  /** Rebases absolute URLs on the endpoint's origin (path, tenant prefix kept) */
  const rebase = (value: string): string => {
    if (assetBaseUrl === undefined) return value;
    let parsed: URL;
    try {
      parsed = new URL(value.trim());
    } catch {
      return value;
    }
    if (parsed.origin !== endpoint.origin) return value;
    return `${assetBaseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
  };

  return {
    async assetById<T = CockpitAsset>(assetId: string): Promise<T | null> {
      return get<T>(ctx, `/assets/${segment(assetId, "assetId")}`, {
        cache: false,
      });
    },

    async imageAssetById(
      assetId: string,
      queryParams: ImageAssetQueryParams,
    ): Promise<string | null> {
      // `o` (binary output) and `re` (redirect) would return the image itself
      const params: Record<string, unknown> = { ...queryParams };
      delete params["o"];
      delete params["re"];
      const url = ctx.url.build(
        `/assets/image/${segment(assetId, "assetId")}`,
        {
          queryParams: params,
        },
      );
      const imageUrl = await ctx.http.request<string>("GET", url, {
        text: true,
      });
      return imageUrl === null ? null : rebase(imageUrl);
    },

    async uploadAssets(
      files: File[],
      { folder }: UploadAssetsOptions = {},
    ): Promise<UploadAssetsResponse | null> {
      requireParam(files, "files");
      if (files.length === 0) return { assets: [] };
      const form = new FormData();
      for (const file of files) form.append("files[]", file);
      const url = ctx.url.build("/unchained/assets/upload", {
        queryParams: { folder: folder === "" ? undefined : folder },
      });
      return ctx.http.request<UploadAssetsResponse>("POST", url, {
        form,
        useAdminAccess: true,
      });
    },
  };
}

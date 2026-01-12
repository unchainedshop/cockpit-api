/**
 * Asset API methods
 */

import type { MethodContext } from "./content.ts";
import { requireParam } from "../core/validation.ts";

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

export interface ImageAssetQueryParams {
  m?: ImageSizeMode;
  w?: number;
  h?: number;
  q?: number;
  mime?: MimeType;
  re?: number;
  t?: string;
  o?: number;
}

export interface AssetMethods {
  assetById<T = CockpitAsset>(assetId: string): Promise<T | null>;
  /**
   * Get a transformed image asset URL.
   *
   * **Important:** The `w` (width) or `h` (height) parameter is required by the API.
   * Without it, the API returns a 400 error.
   *
   * @param assetId - The asset ID
   * @param queryParams - Image transformation parameters (w or h required)
   * @returns URL string to the generated image, or null if not found
   */
  imageAssetById(
    assetId: string,
    queryParams?: ImageAssetQueryParams,
  ): Promise<string | null>;
}

export function createAssetMethods(ctx: MethodContext): AssetMethods {
  return {
    async assetById<T = CockpitAsset>(assetId: string): Promise<T | null> {
      requireParam(assetId, "assetId");
      const url = ctx.url.build(`/assets/${assetId}`);
      return ctx.http.fetch<T>(url);
    },

    async imageAssetById(
      assetId: string,
      queryParams?: ImageAssetQueryParams,
    ): Promise<string | null> {
      requireParam(assetId, "assetId");
      const url = ctx.url.build(`/assets/image/${assetId}`, {
        queryParams: queryParams as Record<string, unknown>,
      });
      return ctx.http.fetchText(url);
    },
  };
}

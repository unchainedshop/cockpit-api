/**
 * Asset API methods
 */

import type { MethodContext } from "./content.ts";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Implementation
// ============================================================================

const requireParam = (value: unknown, name: string): void => {
  if (!value) throw new Error(`Cockpit: Please provide ${name}`);
};

export interface AssetMethods {
  assetById<T = unknown>(assetId: string): Promise<T | null>;
  imageAssetById<T = unknown>(assetId: string, queryParams?: ImageAssetQueryParams): Promise<T | null>;
}

export function createAssetMethods(ctx: MethodContext): AssetMethods {
  return {
    async assetById<T = unknown>(assetId: string): Promise<T | null> {
      requireParam(assetId, "assetId");
      const url = ctx.url.build(`/assets/${assetId}`);
      return ctx.http.fetch<T>(url);
    },

    async imageAssetById<T = unknown>(assetId: string, queryParams?: ImageAssetQueryParams): Promise<T | null> {
      requireParam(assetId, "assetId");
      const url = ctx.url.build(`/assets/image/${assetId}`, {
        queryParams: queryParams as Record<string, unknown>,
      });
      return ctx.http.fetch<T>(url);
    },
  };
}

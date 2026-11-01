import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { authenticate } from "../../middleware/authenticate";
import { getValidated, validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";

/**
 * POST /api/upload — server-side imgbb proxy.
 *
 * Keeps the imgbb API key on the server (IMGBB_API_KEY). The browser
 * sends a base64 image (data URL or raw base64); the server validates
 * the type/size and forwards it to imgbb, returning the hosted URL.
 */
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const uploadSchema = z.object({
  image: z
    .string()
    .min(1, "Image data is required")
    .max(12_000_000, "Image is too large (max ~8 MB)"),
  name: z.string().trim().max(100).optional(),
});

interface ImgbbResponse {
  success?: boolean;
  error?: { message?: string };
  data?: { url?: string; display_url?: string; width?: number; height?: number; size?: number };
}

function extractBase64(image: string): { base64: string; mime: string | null } {
  const dataUrlMatch = /^data:([a-z0-9/+.-]+);base64,(.*)$/i.exec(image);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1] ?? null;
    return { base64: dataUrlMatch[2] ?? "", mime };
  }
  if (/^[a-z0-9+/=\s]+$/i.test(image)) {
    return { base64: image.replace(/\s+/g, ""), mime: null };
  }
  throw ApiError.badRequest("Image must be a base64 data URL or raw base64 string.");
}

export const uploadRouter = Router();

uploadRouter.post("/", authenticate, validate(uploadSchema), async (req, res) => {
  const input = getValidated<{ image: string; name?: string }>(req, "body");
  const { base64, mime } = extractBase64(input.image);

  if (mime && !ALLOWED_MIME.has(mime.toLowerCase())) {
    throw ApiError.badRequest("Only JPEG, PNG, WebP or GIF images are allowed.");
  }

  if (!env.IMGBB_API_KEY) {
    throw new ApiError(
      501,
      "Image upload is not configured on the server. Set IMGBB_API_KEY or paste an image URL instead."
    );
  }

  const form = new FormData();
  form.append("image", base64);
  if (input.name) form.append("name", input.name);

  let upstream: Response;
  try {
    upstream = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError(502, "Could not reach the image hosting service.");
  }

  const payload = (await upstream.json().catch(() => null)) as ImgbbResponse | null;
  if (!payload || !payload.success || !payload.data?.url) {
    const reason = payload?.error?.message ?? "Unknown upload error";
    throw new ApiError(502, `Image upload failed: ${reason}`);
  }

  sendSuccess(
    res,
    "Image uploaded successfully",
    {
      url: payload.data.display_url ?? payload.data.url,
      width: payload.data.width ?? null,
      height: payload.data.height ?? null,
      size: payload.data.size ?? null,
    },
    201
  );
});

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Environment is validated once at startup. Missing or invalid values fail
 * fast with a readable message instead of crashing mid-request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(5001),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  DB_NAME: z.string().min(1).default("studiospace"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters long"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  JWT_COOKIE_NAME: z.string().min(1).default("studiospace_session"),
  INTERNAL_API_SECRET: z
    .string()
    .min(16, "INTERNAL_API_SECRET must be at least 16 characters long"),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),
  IMGBB_API_KEY: z.string().default(""),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\n` +
      "Copy .env.example to .env and fill in the required values."
  );
}

export const env = parsed.data;

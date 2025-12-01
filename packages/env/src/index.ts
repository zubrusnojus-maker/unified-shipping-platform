/// <reference types="node" />
/* Centralized environment variable accessors with deprecation warnings */

interface DeprecationRecord {
  deprecated: string;
  replacement: string;
}

const deprecations: DeprecationRecord[] = [
  { deprecated: "EASYSHIP_UNITS_WEIGHT", replacement: "EASYSHIP_WEIGHT_UNIT" },
  // Support both misspelled and correct legacy names
  {
    deprecated: "EASYSHIP_UNITS_DIMENSION",
    replacement: "EASYSHIP_DIMENSION_UNIT",
  },
  {
    deprecated: "EASYSHIP_UNITS_DIMENSIONS",
    replacement: "EASYSHIP_DIMENSION_UNIT",
  },
  { deprecated: "POSTGRES_PASSWORD", replacement: "PGPASSWORD" },
];

let warned = false;
function emitDeprecationWarnings() {
  if (warned) return;
  const found = deprecations.filter(
    (d) => process.env[d.deprecated] && !process.env[d.replacement],
  );
  if (found.length) {
    const msg = found
      .map(
        (f) => `  ${f.deprecated} is deprecated, use ${f.replacement} instead`,
      )
      .join("\n");
    console.warn(
      `[env] Deprecated variables detected:\n${msg}\nPlease migrate your environment variables accordingly.`,
    );
  }
  warned = true;
}

function bool(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (!v) return defaultValue;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function integer(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (!v) return defaultValue;
  const parsed = parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

emitDeprecationWarnings();

// Optional strict validation toggle
const strictValidation = ["1", "true", "yes", "on"].includes(
  (process.env.ENV_VALIDATION_STRICT || "false").toLowerCase(),
);

// Zod-based schema validations (lightweight unless strict enabled)
import { z } from "zod";

const weightUnitSchema = z.enum(["kg", "lb"]);
const dimUnitSchema = z.enum(["cm", "in"]);
const incotermSchema = z.enum(["DDP", "DDU"]);
const modeSchema = z.enum(["sandbox", "production"]);

const easyshipSchema = z.object({
  apiKey: strictValidation
    ? z.string().min(1, "EASYSHIP_API_KEY is required")
    : z.string().optional().default(""),
  mode: modeSchema,
  weightUnit: weightUnitSchema,
  dimensionUnit: dimUnitSchema,
  incotermDefault: incotermSchema,
  ddpRestricted: z.array(z.string()).default([]),
  currency: z.string().min(1),
  baseUrlOverride: z.string().optional(),
  labelFormat: z
    .union([z.literal("PDF"), z.literal("PNG"), z.literal("ZPL")])
    .optional(),
});

const easypostSchema = z.object({
  apiKey: z.string().optional().default(""),
  mode: z.enum(["test", "production"]),
  labelFormat: z
    .union([z.literal("PDF"), z.literal("PNG"), z.literal("ZPL")])
    .optional(),
  requireEndShipper: z.enum(["auto", "true", "false"]).optional(),
  endShipperId: z.string().optional(),
});

function validateShippingEnv(env: typeof shippingEnv) {
  try {
    easypostSchema.parse(env.easypost);
    easyshipSchema.parse(env.easyship);
  } catch (e: unknown) {
    const msg = `[env] Validation error: ${e instanceof Error ? e.message : String(e)}`;
    if (strictValidation) {
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  }
  // Soft recommendations (non-strict mode): surface warnings for common misconfig
  if (!strictValidation) {
    const soft: string[] = [];
    if (!env.easyship.apiKey) soft.push("EASYSHIP_API_KEY is empty");
    if (!env.easypost.apiKey) soft.push("EASYPOST_API_KEY is empty");
    if (soft.length) {
      console.warn(`[env] Recommendations: ${soft.join("; ")}`);
    }
  }
}

const easypostMode: "test" | "production" =
  process.env.EASYPOST_MODE === "production" ? "production" : "test";
const easypostApiKey =
  easypostMode === "production"
    ? process.env.EASYPOST_PROD_API_KEY || process.env.EASYPOST_API_KEY || ""
    : process.env.EASYPOST_TEST_API_KEY || process.env.EASYPOST_API_KEY || "";

export const shippingEnv = {
  easypost: {
    apiKey: easypostApiKey,
    mode: easypostMode,
    labelFormat: process.env.EASYPOST_LABEL_FORMAT as string | undefined,
    requireEndShipper: (
      process.env.EASYPOST_REQUIRE_END_SHIPPER || "auto"
    ).toLowerCase(),
    endShipperId: process.env.EASYPOST_END_SHIPPER_ID || "",
  },
  easyship: {
    apiKey: process.env.EASYSHIP_API_KEY || "",
    mode: (process.env.EASYSHIP_MODE === "production"
      ? "production"
      : "sandbox") as "production" | "sandbox",
    weightUnit:
      process.env.EASYSHIP_WEIGHT_UNIT ||
      process.env.EASYSHIP_UNITS_WEIGHT ||
      "kg",
    dimensionUnit:
      process.env.EASYSHIP_DIMENSION_UNIT ||
      process.env.EASYSHIP_UNITS_DIMENSIONS ||
      "cm",
    incotermDefault: (
      process.env.EASYSHIP_INCOTERM_DEFAULT || "DDP"
    ).toUpperCase(),
    ddpRestricted: (process.env.EASYSHIP_DDP_RESTRICTED || "MX,BR,AR")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
    currency:
      process.env.EASYSHIP_CURRENCY ||
      process.env.SHIPPING_DEFAULT_CURRENCY ||
      "USD",
    baseUrlOverride: process.env.EASYSHIP_BASE_URL,
    labelFormat: process.env.EASYSHIP_LABEL_FORMAT as string | undefined,
  },
  n8n: {
    baseUrl: process.env.N8N_WEBHOOK_BASE_URL || "",
    intakePath: process.env.N8N_WEBHOOK_INTAKE_PATH || "",
    ratesPath: process.env.N8N_WEBHOOK_RATES_PATH || "",
    bookPath: process.env.N8N_WEBHOOK_BOOK_PATH || "",
    trackingPath: process.env.N8N_WEBHOOK_TRACKING_PATH || "",
  },
  shipperDefaults: {
    name: process.env.SHIPPER_NAME,
    company: process.env.SHIPPER_COMPANY,
    street1: process.env.SHIPPER_STREET1,
    street2: process.env.SHIPPER_STREET2,
    city: process.env.SHIPPER_CITY,
    state: process.env.SHIPPER_STATE,
    zip: process.env.SHIPPER_ZIP,
    country: process.env.SHIPPER_COUNTRY,
    phone: process.env.SHIPPER_PHONE,
    email: process.env.SHIPPER_EMAIL,
  },
  validation: {
    mode: (process.env.ADDRESS_VALIDATION_MODE || "remote").toLowerCase(),
    autofix: ["1", "true", "yes", "on"].includes(
      (process.env.ADDRESS_AUTOFIX || "false").toLowerCase(),
    ),
  },
};

// Perform validation (warn by default, throw if strict)
validateShippingEnv(shippingEnv);

export const databaseEnv = {
  host: process.env.PGHOST || "localhost",
  port: integer("PGPORT", 5432),
  user: process.env.PGUSER || "unified",
  password:
    process.env.PGPASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    "unified_password",
  database: process.env.PGDATABASE || "unified_shipping",
  ssl: bool("PGSSL", false),
};

export const agentEnv = {
  redisUrl: process.env.REDIS_URL || "redis://redis:6379",
  queueName: process.env.AGENT_QUEUE_NAME || "agent-tasks",
  sandboxDir: process.env.SANDBOX_DIR || "/tmp/agent-sandbox",
  workerConcurrency: integer("WORKER_CONCURRENCY", 1),
  managerConcurrency: integer("MANAGER_CONCURRENCY", 2),
};

export const llmEnv = {
  hfToken: process.env.HF_TOKEN || "",
  hfModel: process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.2",
};

export const githubEnv = {
  token: process.env.GITHUB_TOKEN || "",
  owner: process.env.GITHUB_OWNER || "",
  repo: process.env.GITHUB_REPO || "",
};

export const serverEnv = {
  port: integer("PORT", 3000),
  nodeEnv: process.env.NODE_ENV || "development",
};

export const featureFlags = {
  enableVerboseShippingLogs: bool("FEATURE_VERBOSE_SHIPPING_LOGS", false),
};

export type ShippingEnv = typeof shippingEnv;
export type DatabaseEnv = typeof databaseEnv;
export type AgentEnv = typeof agentEnv;
export type LlmEnv = typeof llmEnv;
export type GithubEnv = typeof githubEnv;
export type ServerEnv = typeof serverEnv;

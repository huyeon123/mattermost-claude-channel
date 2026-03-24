import { z } from "zod";

const parseStringArray = (value: string | undefined): string[] => {
  if (!value || value.trim() === "") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const ConfigSchema = z.object({
  mattermostUrl: z
    .string()
    .url("MATTERMOST_URL must be a valid URL")
    .transform((url) => url.replace(/\/+$/, "")),
  mattermostToken: z
    .string()
    .min(1, "MATTERMOST_TOKEN must not be empty"),
  allowedUsers: z.array(z.string()).default([]),
  adminUsers: z.array(z.string()).default([]),
  logLevel: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  listenChannels: z.array(z.string()).default([]),
  logFile: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const raw = {
    mattermostUrl: process.env.MATTERMOST_URL,
    mattermostToken: process.env.MATTERMOST_TOKEN,
    allowedUsers: parseStringArray(process.env.ALLOWED_USERS),
    adminUsers: parseStringArray(process.env.ADMIN_USERS),
    logLevel: process.env.LOG_LEVEL,
    listenChannels: parseStringArray(process.env.LISTEN_CHANNELS),
    logFile: process.env.LOG_FILE || undefined,
  };

  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Configuration validation failed:\n${errors}\n\nRequired environment variables:\n  - MATTERMOST_URL: Mattermost server URL (e.g. https://mattermost.example.com)\n  - MATTERMOST_TOKEN: Bot token or Personal Access Token`
    );
  }

  return result.data;
}

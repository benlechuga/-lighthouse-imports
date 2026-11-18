// Lê e valida as variáveis de ambiente em um só lugar.

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),

  whatsapp: {
    token: env.WHATSAPP_TOKEN || "",
    appSecret: env.WHATSAPP_APP_SECRET || "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    graphVersion: env.GRAPH_API_VERSION || "v23.0",
    dryRun: env.WHATSAPP_DRY_RUN === "true",
  },

  ownerWhatsapp: (env.OWNER_WHATSAPP || "").replace(/\D/g, ""),

  claude: {
    model: env.CLAUDE_MODEL || "claude-opus-5-5",
    effort: env.CLAUDE_EFFORT || "low",
    fallbacks: env.CLAUDE_FALLBACKS ?? "default",
  },

  debounceMs: Number(env.DEBOUNCE_MS ?? 3000),
  maxHistoryMessages: Number(env.MAX_HISTORY_MESSAGES || 40),
  timezone: env.TIMEZONE || "America/Sao_Paulo",
  leadsWebhookUrl: env.LEADS_WEBHOOK_URL || "",
  dataDir: env.DATA_DIR || "data",
};

/** Lista o que falta para rodar em produção (o servidor avisa no início). */
export function missingConfig() {
  const missing = [];
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) missing.push("ANTHROPIC_API_KEY");
  if (!config.whatsapp.dryRun) {
    if (!config.whatsapp.token) missing.push("WHATSAPP_TOKEN");
    if (!config.whatsapp.appSecret) missing.push("WHATSAPP_APP_SECRET");
  }
  if (!config.whatsapp.verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");
  return missing;
}

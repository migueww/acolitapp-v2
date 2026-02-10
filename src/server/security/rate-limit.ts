import { ApiError } from "@/src/server/http/errors";

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const attemptsByIp = new Map<string, RateLimitRecord>();

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export const assertLoginRateLimit = (ip: string): void => {
  const now = Date.now();
  const current = attemptsByIp.get(ip);

  if (!current || current.resetAt <= now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  if (current.count >= MAX_ATTEMPTS) {
    throw new ApiError({
      code: "RATE_LIMITED",
      status: 429,
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
      details: { resetAt: new Date(current.resetAt).toISOString() },
    });
  }

  current.count += 1;
  attemptsByIp.set(ip, current);
};

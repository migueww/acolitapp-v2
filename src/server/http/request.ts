export const getRequestId = (req: Request): string => req.headers.get("x-request-id") || crypto.randomUUID();

export const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.headers.get("x-real-ip") || "unknown";
};

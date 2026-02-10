export const logInfo = (requestId: string, message: string, context?: Record<string, unknown>) => {
  if (context) {
    console.info(`[${requestId}] ${message}`, context);
    return;
  }

  console.info(`[${requestId}] ${message}`);
};

export const logError = (requestId: string, message: string, error?: unknown) => {
  if (error) {
    console.error(`[${requestId}] ${message}`, error);
    return;
  }

  console.error(`[${requestId}] ${message}`);
};

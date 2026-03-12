"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryAsync = retryAsync;
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function retryAsync(fn, options = {}) {
    const maxRetries = options.maxRetries ?? 5;
    const baseDelayMs = options.baseDelayMs ?? 500;
    const maxDelayMs = options.maxDelayMs ?? 15_000;
    const jitterRatio = options.jitterRatio ?? 0.2;
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            if (attempt >= maxRetries)
                break;
            const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            const jitter = exp * jitterRatio * Math.random();
            const delay = Math.round(exp + jitter);
            options.onRetry?.(attempt, delay, err);
            await sleep(delay);
        }
    }
    throw lastErr;
}

import "server-only";

export class TelegramPerformance {
  private readonly startedAt = performance.now();
  private readonly metrics: Record<string, number | boolean | string> = { webhook_received: true };

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try { return await operation(); }
    finally { this.metrics[`${name}_ms`] = Math.round(performance.now() - started); }
  }

  set(name: string, value: number | boolean | string) { this.metrics[name] = value; }
  duration(name: string, startedAt: number) { this.metrics[`${name}_ms`] = Math.round(performance.now() - startedAt); }

  log(metadata: { updateId: number; flow: string }) {
    this.metrics.total_ms = Math.round(performance.now() - this.startedAt);
    console.info("telegram_perf", { ...metadata, ...this.metrics });
  }
}

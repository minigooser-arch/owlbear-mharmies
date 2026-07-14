export class SubscriptionManager {
  private readonly subscriptions = new Set<() => void>();

  get size(): number {
    return this.subscriptions.size;
  }

  add(unsubscribe: () => void): () => void {
    this.subscriptions.add(unsubscribe);
    return () => {
      if (!this.subscriptions.delete(unsubscribe)) return;
      unsubscribe();
    };
  }

  clear(): void {
    const subscriptions = [...this.subscriptions];
    this.subscriptions.clear();
    for (const unsubscribe of subscriptions) unsubscribe();
  }
}

import { SecurityEvent } from '../shared/types';

export class EventBus {
  private static instance: EventBus;
  private events: SecurityEvent[] = [];
  private readonly MAX_EVENTS = 100;
  private listeners: ((event: SecurityEvent) => void)[] = [];

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  emit(
    category: SecurityEvent['category'],
    severity: SecurityEvent['severity'],
    technicalReason: string,
    userExplanation: string
  ): SecurityEvent {
    const event: SecurityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      category,
      severity,
      technicalReason,
      userExplanation,
    };

    this.events.unshift(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.pop();
    }

    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[ShadowBrowse EventBus] Listener error:', err);
      }
    });

    return event;
  }

  getEvents(limit = 50): SecurityEvent[] {
    return this.events.slice(0, limit);
  }

  clear(): void {
    this.events = [];
  }

  subscribe(listener: (event: SecurityEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

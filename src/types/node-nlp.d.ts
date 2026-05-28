declare module "node-nlp" {
  export class NlpManager {
    constructor(options?: Record<string, unknown>);
    addDocument(locale: string, utterance: string, intent: string): void;
    addAnswer(locale: string, intent: string, answer: string): void;
    train(): Promise<void>;
    process(
      locale: string,
      utterance: string
    ): Promise<{ answer?: string; intent?: string; score?: number }>;
  }
}

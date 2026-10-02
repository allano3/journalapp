export type ChangeTopic = "entries" | "convictions" | "reviews" | "settings" | "embeddings" | "ai";

type Listener = (topic: ChangeTopic) => void;

const listeners = new Set<Listener>();

/** Minimal change bus: repositories emit after writes; hooks re-query. */
export const changes = {
  emit(topic: ChangeTopic): void {
    for (const l of listeners) l(topic);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export type ClipboardHistoryItem = {
    id: string;
    text: string;
    createdAt: number;
};

export type ClipboardHistoryStateV1 = {
    version: 1;
    paused: boolean;
    items: ClipboardHistoryItem[];
};

const STORAGE_KEY = "clipboard-history:v1";
const MAX_ITEMS = 200;
const MAX_TEXT_LENGTH = 10_000;
const COPY_BACK_SUPPRESS_MS = 2_000;

type Listener = (state: ClipboardHistoryStateV1) => void;

const listeners = new Set<Listener>();

let suppressedText: string | undefined;
let suppressedUntil: number | undefined;

let state: ClipboardHistoryStateV1 = loadState();

function generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);

        let hex = "";
        for (const byte of bytes) {
            hex += byte.toString(16).padStart(2, "0");
        }
        return hex;
    }

    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function defaultState(): ClipboardHistoryStateV1 {
    return { version: 1, paused: false, items: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isItem(value: unknown): value is ClipboardHistoryItem {
    if (!isRecord(value)) return false;
    return (
        typeof value.id === "string" &&
        typeof value.text === "string" &&
        typeof value.createdAt === "number"
    );
}

function loadState(): ClipboardHistoryStateV1 {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();

        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed) || parsed.version !== 1) return defaultState();

        const itemsRaw = parsed.items;
        let items = Array.isArray(itemsRaw)
            ? itemsRaw
                  .slice(0, MAX_ITEMS * 5)
                  .filter(isItem)
                  .filter(item => Number.isFinite(item.createdAt) && item.createdAt >= 0)
                  .filter(item => item.text.trim().length > 0)
                  .filter(item => item.text.length <= MAX_TEXT_LENGTH)
            : [];

        let needsSort = false;
        for (let index = 0; index < items.length - 1; index++) {
            if (items[index]!.createdAt < items[index + 1]!.createdAt) {
                needsSort = true;
                break;
            }
        }

        if (needsSort) {
            items = items
                .map((item, index) => ({ item, index }))
                .sort((a, b) => {
                    const diff = b.item.createdAt - a.item.createdAt;
                    if (diff !== 0) return diff;
                    return a.index - b.index;
                })
                .map(({ item }) => item);
        }

        items = items.slice(0, MAX_ITEMS);

        return {
            version: 1,
            paused: Boolean(parsed.paused),
            items,
        };
    } catch {
        return defaultState();
    }
}

function persist(next: ClipboardHistoryStateV1): void {
    state = next;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage quota / serialization errors should not crash the plugin.
    }

    for (const listener of listeners) {
        listener(state);
    }
}

function update(updater: (prev: ClipboardHistoryStateV1) => ClipboardHistoryStateV1): ClipboardHistoryStateV1 {
    const next = updater(state);
    persist(next);
    return next;
}

export function getState(): ClipboardHistoryStateV1 {
    return state;
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function isPaused(): boolean {
    return state.paused;
}

export function setPaused(paused: boolean): void {
    if (paused === state.paused) return;
    update(prev => ({ ...prev, paused }));
}

export function togglePaused(): boolean {
    const next = !state.paused;
    setPaused(next);
    return next;
}

export function clearAll(): void {
    if (state.items.length === 0) return;
    update(prev => ({ ...prev, items: [] }));
}

export function deleteItem(id: string): void {
    if (!state.items.some(item => item.id === id)) return;
    update(prev => ({ ...prev, items: prev.items.filter(item => item.id !== id) }));
}

export function suppressNextRecord(text: string, now: number = Date.now()): void {
    suppressedText = text;
    suppressedUntil = now + COPY_BACK_SUPPRESS_MS;
}

export function clearSuppression(): void {
    suppressedText = undefined;
    suppressedUntil = undefined;
}

function shouldSuppress(text: string, now: number): boolean {
    if (suppressedText === undefined || suppressedUntil === undefined) return false;
    if (now > suppressedUntil) {
        clearSuppression();
        return false;
    }

    if (text !== suppressedText) return false;

    // Suppress only once to avoid silently dropping future legitimate copies.
    clearSuppression();
    return true;
}

export function addClipboardText(text: string, now: number = Date.now()): { added: boolean } {
    if (text.trim().length === 0) return { added: false };

    if (text.length > MAX_TEXT_LENGTH) {
        return { added: false };
    }

    if (shouldSuppress(text, now)) {
        return { added: false };
    }

    update(prev => {
        const itemsWithoutText = prev.items.filter(item => item.text !== text);

        const nextItem: ClipboardHistoryItem = {
            id: generateId(),
            text,
            createdAt: now,
        };

        const items = [nextItem, ...itemsWithoutText].slice(0, MAX_ITEMS);

        return { ...prev, items };
    });

    return { added: true };
}

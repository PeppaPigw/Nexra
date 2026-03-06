import { Clipboard, GeneratorContext } from "@project-gauntlet/api/helpers";
import { addClipboardText, isPaused } from "./clipboard_history_store";

const POLL_INTERVAL_MS = 900;

export default async function ClipboardHistoryWatcher(_context: GeneratorContext): Promise<() => void> {
    let inFlight = false;
    let lastSeenText: string | undefined;
    let wasPaused = isPaused();

    if (!wasPaused) {
        try {
            lastSeenText = await Clipboard.readText();
        } catch {
            // Ignore clipboard read errors; recording will retry on the next tick.
        }
    }

    const handle = setInterval(() => {
        if (inFlight) return;

        inFlight = true;
        // noinspection ES6MissingAwait
        (async () => {
            try {
                const paused = isPaused();
                if (paused) {
                    wasPaused = true;
                    return;
                }

                if (wasPaused) {
                    try {
                        lastSeenText = await Clipboard.readText();
                    } catch {
                        // Ignore baseline read errors.
                    }
                    wasPaused = false;
                    return;
                }

                const text = await Clipboard.readText();
                if (text === undefined) return;
                if (text === lastSeenText) return;

                lastSeenText = text;
                addClipboardText(text, Date.now());
            } catch {
                // Swallow errors (avoid logging clipboard content).
            } finally {
                inFlight = false;
            }
        })();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(handle);
}

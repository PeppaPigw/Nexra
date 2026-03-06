import React, { ReactElement, useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Icons, List } from "@project-gauntlet/api/components";
import { Clipboard, showHud } from "@project-gauntlet/api/helpers";
import {
    clearAll,
    clearSuppression,
    deleteItem,
    getState,
    subscribe,
    suppressNextRecord,
    togglePaused,
    type ClipboardHistoryItem,
} from "./clipboard_history_store";

export default function ClipboardHistory(): ReactElement {
    const [query, setQuery] = useState<string>("");
    const [state, setState] = useState(getState);
    const [clearAllArmedUntilMs, setClearAllArmedUntilMs] = useState<number | undefined>(undefined);

    useEffect(() => subscribe(setState), []);

    useEffect(() => {
        if (clearAllArmedUntilMs === undefined) return;

        const now = Date.now();
        const remainingMs = clearAllArmedUntilMs - now;
        if (remainingMs <= 0) {
            setClearAllArmedUntilMs(undefined);
            return;
        }

        const handle = setTimeout(() => setClearAllArmedUntilMs(undefined), remainingMs);
        return () => clearTimeout(handle);
    }, [clearAllArmedUntilMs]);

    const filteredItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return state.items;

        return state.items.filter(item => item.text.toLowerCase().includes(q));
    }, [query, state.items]);

    const pausedLabel = state.paused ? "Resume recording" : "Pause recording";
    const clearAllArmed = clearAllArmedUntilMs !== undefined;
    const clearAllLabel = clearAllArmed ? "Clear all (confirm)" : "Clear all";

    return (
        <List
            actions={
                <ActionPanel>
                    <ActionPanel.Section title="Item">
                        <Action
                            label="Copy back"
                            onAction={async id => {
                                if (!id) {
                                    showHud("Select an item")
                                    return;
                                }

                                const item = state.items.find(value => value.id === id);
                                if (!item) {
                                    showHud("Item not found")
                                    return;
                                }

                                suppressNextRecord(item.text);
                                try {
                                    await Clipboard.writeText(item.text);
                                } catch {
                                    clearSuppression();
                                    showHud("Failed to copy");
                                    return;
                                }
                                showHud("Copied to clipboard");
                            }}
                        />
                        <Action
                            label="Delete item"
                            onAction={id => {
                                if (!id) {
                                    showHud("Select an item")
                                    return;
                                }
                                deleteItem(id);
                                showHud("Deleted");
                            }}
                        />
                    </ActionPanel.Section>

                    <ActionPanel.Section title="History">
                        <Action
                            label={pausedLabel}
                            onAction={() => {
                                const paused = togglePaused();
                                showHud(paused ? "Recording paused" : "Recording resumed");
                            }}
                        />
                        <Action
                            label={clearAllLabel}
                            onAction={() => {
                                const now = Date.now();
                                const armed = clearAllArmedUntilMs !== undefined && now < clearAllArmedUntilMs;

                                if (!armed) {
                                    setClearAllArmedUntilMs(now + 5_000);
                                    showHud("Press again within 5s to clear all");
                                    return;
                                }

                                setClearAllArmedUntilMs(undefined);
                                clearAll();
                                showHud("Cleared");
                            }}
                        />
                    </ActionPanel.Section>
                </ActionPanel>
            }
        >
            <List.SearchBar value={query} placeholder="Search clipboard history" onChange={setQuery} />

            {filteredItems.length === 0 ? (
                <List.EmptyView
                    title="No clipboard history"
                    description={state.paused ? "Recording is paused." : "Copy some text to start recording."}
                />
            ) : null}

            {filteredItems.map(item => (
                <ClipboardHistoryItemRow key={item.id} item={item} />
            ))}
        </List>
    );
}

function ClipboardHistoryItemRow({ item }: { item: ClipboardHistoryItem }): ReactElement {
    return (
        <List.Item
            id={item.id}
            title={formatTitle(item.text)}
            subtitle={formatTimestamp(item.createdAt)}
            icon={Icons.Clipboard}
        />
    );
}

function formatTitle(text: string): string {
    const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
    const title = firstLine.trim();

    if (title.length === 0) return "(blank)";
    if (title.length <= 120) return title;

    return title.slice(0, 117) + "...";
}

function formatTimestamp(epochMs: number): string {
    try {
        return new Date(epochMs).toLocaleString();
    } catch {
        return String(epochMs);
    }
}

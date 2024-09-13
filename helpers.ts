import chroma from "chroma-js";
import { RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

export function getRatingPercentage (likes: number, dislikes: number): number {
    if (likes === dislikes) {
        return 50;
    }
    if (likes > dislikes) {
        return 50 + ((likes - dislikes) / (likes + dislikes) * 50);
    }
    if (likes < dislikes) {
        return 50 - ((dislikes - likes) / (likes + dislikes) * 50);
    }
    return 50;
}

export function getRatingColor (rating: number, type: "step" | "gradient" = "step"): string {

    // Clamp rating to 0-100
    rating = Math.min(Math.max(rating, 0), 100);

    // Check if chroma is available
    if (chroma !== undefined && type === "gradient") {
        return chroma.mix("#4CBBFC", "#ad0441", rating / 100, "rgb").hex();
    }
    else {
        // Fallback in steps of 4
        if (rating < 25) {
            return "#FF4136";
        }
        if (rating < 50) {
            return "#FF851B";
        }
        if (rating < 75) {
            return "#FFDC00";
        }
        return "#2ECC40";
    }
}

export function getRandomUUID ({ exclude }: { exclude?: string[] } = {}): string {
    let uuid: string;
    do {
        uuid = uuidv4();
    } while (exclude && exclude.includes(uuid));
    return uuid;
}

export function convertToMarkdownLinks (text: string): string {
    const urlRegex = /(https?:\/\/[^\s]+)(?!(?:\[(.*?)\]\((.*?)\)))/g;
    return text.replace(urlRegex, (url) => `[${url}](${url})`);
}

export function timeFromCreatedAt (createdAt: string) {
    // Return as hh:mm (24-hour format)
    return new Date(createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function dateFromCreatedAt (createdAt: string) {
    // Return as dd/mm/yyyy
    return new Date(createdAt).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function isDarkColor (color: string): boolean {
    const [r, g, b] = chroma(color).rgb();
    return (r * 0.299 + g * 0.587 + b * 0.114) > 186;
}

export function isLightColor (color: string): boolean {
    return !isDarkColor(color);
}

export function getContrastColor (color: string): string {
    return isDarkColor(color) ? "#fff" : "#000";
}

export function useInViewport(): { isInViewport: boolean; ref: React.RefCallback<HTMLElement> } {
    const [isInViewport, setIsInViewport] = useState(false);
    const [refElement, setRefElement] = useState<HTMLElement | null>(null);

    const setRef = useCallback((node: HTMLElement | null) => {
        if (node !== null) {
            setRefElement(node);
        }
    }, []);

    useEffect(() => {
        if (refElement && !isInViewport) {
            const observer = new IntersectionObserver(
                ([entry]) => entry.isIntersecting && setIsInViewport(true)
            );
            observer.observe(refElement);

            return () => {
                observer.disconnect();
            };
        }
    }, [isInViewport, refElement]);

    return { isInViewport, ref: setRef };
}
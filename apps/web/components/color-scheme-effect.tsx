"use client";

import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Applies the profile page's appearance settings to <html>: `.dark` for the
 * color scheme — what globals.css's `@custom-variant dark` keys Tailwind's
 * `dark:` utilities off — `data-accent` for the accent color theme (see
 * globals.css's `:root[data-accent="..."]` rules), `data-font` for the
 * body typeface (see globals.css's `:root[data-font="..."]` rules), and
 * `data-cards` for the card style (see globals.css's `.tinted-card`). "system"
 * tracks the OS/browser preference live via matchMedia rather than a
 * one-time snapshot, so an OS theme change mid-session (or the cache-miss
 * default before the settings row loads) is picked up without a reload.
 */
export function ColorSchemeEffect() {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const colorScheme = cached?.colorScheme ?? DEFAULT_SETTINGS.colorScheme;
  const accentColor = cached?.accentColor ?? DEFAULT_SETTINGS.accentColor;
  const fontFamily = cached?.fontFamily ?? DEFAULT_SETTINGS.fontFamily;
  const cardStyle = cached?.cardStyle ?? DEFAULT_SETTINGS.cardStyle;

  useEffect(() => {
    const root = document.documentElement;

    if (colorScheme !== "system") {
      root.classList.toggle("dark", colorScheme === "dark");
      return;
    }

    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const update = () => root.classList.toggle("dark", query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [colorScheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.setAttribute("data-font", fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.setAttribute("data-cards", cardStyle);
  }, [cardStyle]);

  return null;
}

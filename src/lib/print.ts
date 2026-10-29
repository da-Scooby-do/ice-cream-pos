"use client";

import { useEffect, useState } from "react";

// الطباعة | printing.
//
// In the desktop app, Electron prints silently to the chosen receipt printer
// (no dialog, no Chrome flags). The slip is measured first so the page is
// exactly as long as the slip — the thermal roll is never wasted.
// In a normal browser it falls back to the print dialog.

export type UpdateState = {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "none" | "error";
  version?: string;
  percent?: number;
  error?: string;
};

export type DesktopBridge = {
  isDesktop: true;
  print(opts: { heightMicrons: number }): Promise<{ ok: boolean; error?: string }>;
  listPrinters(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>;
  getConfig(): Promise<{ printer: string | null; fullscreen: boolean }>;
  setConfig(c: Partial<{ printer: string | null; fullscreen: boolean }>): Promise<void>;
  chooseFolder(): Promise<string | null>;
  chooseBackupFile(defaultDir?: string): Promise<string | null>;
  openPath(p: string): Promise<void>;
  updateState(): Promise<UpdateState>;
  checkUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
};

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export const isDesktopApp = () => typeof window !== "undefined" && !!window.desktop;

/** داخل برنامج اللابتوب؟ (بعد التحميل فقط، لتطابق الصفحة مع الخادم) */
export function useIsDesktop(): boolean {
  const [d, setD] = useState(false);
  useEffect(() => setD(isDesktopApp()), []);
  return d;
}

const PX_TO_MICRONS = 25400 / 96;

/** طول القسيمة بالميكرون (+10 مم ليتجاوز القاطع آخر سطر) | slip length + 10 mm for the cutter */
function measure(root: HTMLElement): number {
  const px = root.getBoundingClientRect().height;
  return Math.max(Math.ceil(px * PX_TO_MICRONS) + 10_000, 50_000);
}

export async function printSlip(): Promise<{ ok: boolean; error?: string }> {
  const root = document.querySelector<HTMLElement>(".print-root");
  if (!root || !root.firstElementChild) return { ok: false, error: "لا يوجد ما يُطبع" };

  root.classList.add("measuring");
  try {
    await document.fonts.ready;
    await Promise.all(
      [...root.querySelectorAll("img")].map((img) =>
        img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r)))
      )
    );
    const heightMicrons = measure(root);
    root.classList.remove("measuring");
    // No CSS @page size on purpose: the paper size goes to the printer only.
    // A CSS size shrank receipts (2.0.5) or made the Xprinter driver cancel
    // the job (2.0.6). Without it the slip prints 1:1 on the paper given.
    if (!window.desktop) {
      // a normal browser: its print dialog, at the same 80 mm page
      window.print();
      return { ok: true };
    }
    return await window.desktop.print({ heightMicrons });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    root.classList.remove("measuring");
  }
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TouchEventHandler } from "react";

type BackLayer = {
  id: string;
  close: () => boolean | void;
  priority: number;
  seq: number;
};

let seq = 0;
const layers: BackLayer[] = [];
let listening = false;
let handlingPop = false;
let suppressNextPop = false;

function sortLayers() {
  layers.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
}

function ensurePopstateListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("popstate", () => {
    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }

    sortLayers();
    const layer = layers.pop();
    if (!layer) return;

    handlingPop = true;
    const closed = layer.close();
    handlingPop = false;

    if (closed === false) {
      layers.push(layer);
      sortLayers();
      window.history.pushState({ __papitransLayer: layer.id }, "", window.location.href);
    }
  });
}

function registerBackLayer(id: string, close: () => boolean | void, priority: number) {
  if (typeof window === "undefined") return () => {};
  ensurePopstateListener();

  const layer: BackLayer = {
    id: `${id}-${++seq}`,
    close,
    priority,
    seq,
  };

  layers.push(layer);
  sortLayers();
  window.history.pushState({ __papitransLayer: layer.id }, "", window.location.href);

  return () => {
    const idx = layers.findIndex((item) => item.id === layer.id);
    const wasTop = idx === layers.length - 1;
    if (idx >= 0) layers.splice(idx, 1);

    if (
      wasTop &&
      !handlingPop &&
      typeof window !== "undefined" &&
      window.history.state?.__papitransLayer === layer.id
    ) {
      suppressNextPop = true;
      window.history.back();
    }
  };
}

export function useAppBackLayer(
  active: boolean,
  id: string,
  onBack: () => boolean | void,
  priority = 0
) {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) return;
    return registerBackLayer(id, () => onBackRef.current(), priority);
  }, [active, id, priority]);
}

function shouldIgnoreSwipeTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  const ignored = target.closest(
    [
      "input",
      "textarea",
      "select",
      "button",
      "a",
      "img",
      "video",
      "canvas",
      "iframe",
      "table",
      "[role='dialog']",
      "[data-swipe-ignore='true']",
      "[data-no-swipe='true']",
      ".overflow-x-auto",
      ".scrollbar-none",
      ".historia-scroll",
    ].join(",")
  );
  return !!ignored;
}

export function useSwipeNavigation({
  enabled = true,
  threshold = 60,
  horizontalRatio = 1.25,
  onSwipeLeft,
  onSwipeRight,
}: {
  enabled?: boolean;
  threshold?: number;
  horizontalRatio?: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const start = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);

  const onTouchStart = useCallback<TouchEventHandler<HTMLElement>>(
    (event) => {
      if (!enabled || event.touches.length !== 1 || shouldIgnoreSwipeTarget(event.target)) {
        start.current = null;
        return;
      }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, target: event.target };
    },
    [enabled]
  );

  const onTouchEnd = useCallback<TouchEventHandler<HTMLElement>>(
    (event) => {
      if (!enabled || !start.current || event.changedTouches.length !== 1) {
        start.current = null;
        return;
      }

      if (shouldIgnoreSwipeTarget(start.current.target)) {
        start.current = null;
        return;
      }

      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      start.current = null;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < threshold || absX < absY * horizontalRatio) return;

      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    [enabled, horizontalRatio, onSwipeLeft, onSwipeRight, threshold]
  );

  return { onTouchStart, onTouchEnd };
}

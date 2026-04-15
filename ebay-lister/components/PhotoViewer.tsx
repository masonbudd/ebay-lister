"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  urls: string[];
  startIndex: number;
  onClose: () => void;
};

export default function PhotoViewer({ urls, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function next() { setIndex((i) => Math.min(urls.length - 1, i + 1)); }
  function prev() { setIndex((i) => Math.max(0, i - 1)); }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
      }}
    >
      <button
        aria-label="Close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full grid place-items-center text-white"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", top: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        ✕
      </button>

      <img
        src={urls[index]}
        alt=""
        className="max-h-[92vh] max-w-[94vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {index > 0 && (
        <button
          aria-label="Previous"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full grid place-items-center text-white"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          ‹
        </button>
      )}
      {index < urls.length - 1 && (
        <button
          aria-label="Next"
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full grid place-items-center text-white"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          ›
        </button>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-xs"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
        {index + 1} / {urls.length}
      </div>
    </div>
  );
}

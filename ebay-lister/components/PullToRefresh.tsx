"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 70;
const MAX_PULL = 120;

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY === 0) {
        setPull(Math.min(MAX_PULL, dy * 0.55));
      }
    };
    const onTouchEnd = async () => {
      if (startY.current == null) return;
      startY.current = null;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        router.refresh();
        setTimeout(() => { setRefreshing(false); setPull(0); }, 700);
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pull, refreshing, router]);

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <>
      <div
        aria-hidden
        className="fixed left-0 right-0 flex justify-center pointer-events-none z-40"
        style={{
          top: "calc(env(safe-area-inset-top) + 8px)",
          opacity: pull > 4 ? 1 : 0,
          transform: `translateY(${pull - 20}px)`,
          transition: refreshing ? "transform 200ms ease" : "none",
        }}
      >
        <div
          className="rounded-full grid place-items-center"
          style={{
            width: 36, height: 36,
            background: "rgba(15,17,23,0.92)",
            border: "1px solid var(--border)",
          }}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{
              color: "var(--accent)",
              transform: `rotate(${progress * 360}deg)`,
              animation: refreshing ? "spin 900ms linear infinite" : undefined,
            }}
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 4v5h-5" />
          </svg>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ transform: `translateY(${pull}px)`, transition: refreshing ? "transform 200ms ease" : (startY.current == null ? "transform 200ms ease" : "none") }}>
        {children}
      </div>
    </>
  );
}

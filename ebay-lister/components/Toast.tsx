"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { uuid } from "@/lib/uuid";

type Variant = "success" | "error" | "info";
type Toast = { id: string; message: string; variant: Variant };

type ToastCtx = {
  toast: (message: string, variant?: Variant) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) return { toast: (m) => console.log("[toast]", m) };
  return c;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, variant: Variant = "info") => {
    const id = uuid();
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(92vw,420px)]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const palette: Record<Variant, { bg: string; border: string; color: string }> = {
    success: { bg: "rgba(16,185,129,0.14)", border: "rgba(16,185,129,0.4)", color: "#86efac" },
    error:   { bg: "rgba(239,68,68,0.14)",  border: "rgba(239,68,68,0.4)",  color: "#fca5a5" },
    info:    { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.4)", color: "#93c5fd" },
  };
  const p = palette[toast.variant];
  return (
    <div
      className="px-4 py-3 rounded-xl text-sm shadow-lg"
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.color,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        transform: mounted ? "translateY(0)" : "translateY(-8px)",
        opacity: mounted ? 1 : 0,
        transition: "transform 180ms ease, opacity 180ms ease",
      }}
    >
      {toast.message}
    </div>
  );
}

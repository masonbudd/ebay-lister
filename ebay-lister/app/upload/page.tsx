"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { compressForUpload } from "@/lib/compress";
import { uuid } from "@/lib/uuid";
import { CameraIcon, PlusIcon } from "@/components/Icons";

type Photo = { id?: string; previewUrl: string; uploading: boolean; error?: string };

type ItemDraft = {
  id: string;              // local id
  dbId?: string;           // items.id once created
  photos: Photo[];
  submitted: boolean;      // true once "Next item" pressed and processing triggered
};

function newDraft(): ItemDraft {
  return { id: uuid(), photos: [], submitted: false };
}

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const e = err as { message?: unknown; error?: unknown; statusCode?: unknown; status?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "string") return e.error;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

export default function UploadPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [current, setCurrent] = useState<ItemDraft>(() => newDraft());
  const [submittedCount, setSubmittedCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) console.error("[upload] getUser error:", toMessage(error), error);
      const id = data.user?.id ?? null;
      console.log("[upload] auth user:", id);
      setUserId(id);
    });
  }, [supabase]);

  const ensureItemRow = useCallback(async (draft: ItemDraft, uid: string): Promise<string> => {
    if (draft.dbId) return draft.dbId;
    console.log("[upload] creating items row for user", uid);
    const { data, error } = await supabase
      .from("items")
      .insert({ status: "uploading", user_id: uid })
      .select("id")
      .single();
    if (error) {
      console.error("[upload] items insert error:", toMessage(error), error);
      throw new Error(`items insert: ${toMessage(error)}`);
    }
    console.log("[upload] items row created:", data.id);
    draft.dbId = data.id;
    setCurrent({ ...draft });
    return data.id;
  }, [supabase]);

  const handleFiles = useCallback(async (incoming: File[]) => {
    if (!incoming || incoming.length === 0) {
      console.warn("[upload] handleFiles called with no files");
      return;
    }
    if (!userId) {
      console.warn("[upload] no userId yet — session not ready");
      setToast("Session not ready. Try again in a moment.");
      setTimeout(() => setToast(null), 2000);
      return;
    }

    // Verify we actually have a live session (cookie on the domain, etc.).
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session) {
      console.error("[upload] no session:", toMessage(sessionErr), sessionErr);
      setToast("Not signed in. Please log in again.");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    console.log("[upload] session ok, expires:", sessionData.session.expires_at);

    // Log every incoming file before any filtering.
    incoming.forEach((f, i) =>
      console.log(`[upload] incoming[${i}]`, { name: f.name, type: f.type, size: f.size }),
    );

    // Permissive image filter: anything that looks like an image, plus HEIC/HEIF,
    // plus empty-type files (mobile often omits the MIME type entirely).
    const isImage = (f: File) => {
      const t = (f.type || "").toLowerCase();
      if (t === "") return true;
      if (t.startsWith("image/")) return true;
      if (t === "image/heic" || t === "image/heif") return true;
      return false;
    };
    const filtered = incoming.filter((f) => {
      const ok = isImage(f);
      if (!ok) console.warn("[upload] rejected non-image:", f.name, f.type);
      return ok;
    });

    const list = filtered.slice(0, 5 - current.photos.length);
    console.log("[upload] handling", list.length, "files (of", incoming.length, "selected)");
    if (list.length === 0) return;

    const placeholders: Photo[] = list.map((f) => ({
      previewUrl: URL.createObjectURL(f),
      uploading: true,
    }));
    const startIdx = current.photos.length;
    setCurrent((d) => ({ ...d, photos: [...d.photos, ...placeholders] }));

    let itemId: string;
    try {
      itemId = await ensureItemRow(current, userId);
    } catch (err) {
      const msg = toMessage(err);
      console.error("[upload] ensureItemRow failed:", msg);
      setCurrent((d) => {
        const photos = [...d.photos];
        for (let i = 0; i < list.length; i++) {
          photos[startIdx + i] = { ...photos[startIdx + i], uploading: false, error: msg };
        }
        return { ...d, photos };
      });
      return;
    }

    await Promise.all(list.map(async (file, i) => {
      const idx = startIdx + i;
      try {
        console.log(`[upload] [${idx}] compressing`, file.name, file.type, file.size);
        const compressed = await compressForUpload(file);
        console.log(`[upload] [${idx}] compressed ->`, compressed.type, compressed.size);

        // Path must match RLS policy: {user_id}/{item_id}/{filename}
        const path = `${userId}/${itemId}/${uuid()}.jpg`;
        console.log(`[upload] [${idx}] uploading to`, path);

        const { error: upErr } = await supabase.storage
          .from("item-photos")
          .upload(path, compressed, {
            contentType: compressed.type || "image/jpeg",
            upsert: false,
            cacheControl: "3600",
          });
        if (upErr) {
          console.error(`[upload] [${idx}] storage error:`, toMessage(upErr), upErr);
          throw new Error(`storage: ${toMessage(upErr)}`);
        }
        console.log(`[upload] [${idx}] storage ok`);

        const { data: photoRow, error: insErr } = await supabase
          .from("photos")
          .insert({ item_id: itemId, storage_path: path, sort_order: idx })
          .select("id")
          .single();
        if (insErr) {
          console.error(`[upload] [${idx}] photos insert error:`, toMessage(insErr), insErr);
          throw new Error(`photos insert: ${toMessage(insErr)}`);
        }
        console.log(`[upload] [${idx}] photos row`, photoRow.id);

        setCurrent((d) => {
          const photos = [...d.photos];
          photos[idx] = { ...photos[idx], id: photoRow.id, uploading: false };
          return { ...d, photos };
        });
      } catch (err) {
        const msg = toMessage(err);
        console.error(`[upload] [${idx}] failed:`, msg);
        setCurrent((d) => {
          const photos = [...d.photos];
          photos[idx] = { ...photos[idx], uploading: false, error: msg };
          return { ...d, photos };
        });
      }
    }));
  }, [current, ensureItemRow, supabase, userId]);

  const nextItem = useCallback(async () => {
    if (!current.dbId || current.photos.length === 0) {
      setCurrent(newDraft());
      return;
    }
    const anyUploading = current.photos.some((p) => p.uploading);
    if (anyUploading) {
      setToast("Still uploading — wait a sec.");
      setTimeout(() => setToast(null), 1500);
      return;
    }
    // Flip to processing and kick off AI (fire-and-forget).
    const { error: updErr } = await supabase.from("items")
      .update({ status: "processing" }).eq("id", current.dbId);
    if (updErr) console.error("[upload] mark processing failed:", toMessage(updErr), updErr);
    fetch("/api/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: current.dbId }),
    }).catch(() => {});
    setSubmittedCount((n) => n + 1);
    setCurrent(newDraft());
  }, [current, supabase]);

  const canSubmit = current.photos.length > 0 && current.photos.every((p) => !p.uploading);

  const hasPhotos = current.photos.length > 0;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-4 space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New item</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Up to 5 photos per item.
          </p>
        </div>
        <span
          className="text-xs px-2.5 py-1 rounded-full"
          style={{ border: "1px solid var(--border)", color: "var(--fg-muted)" }}
        >
          {submittedCount} queued
        </span>
      </div>

      {!hasPhotos ? (
        <label
          htmlFor="photo-input"
          onClick={() => console.log("[upload] + tapped")}
          className="card flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-[0.99]"
          style={{
            borderStyle: "dashed",
            borderColor: "var(--border-strong)",
            minHeight: 280,
            padding: 24,
          }}
        >
          <div
            className="w-16 h-16 rounded-full grid place-items-center mb-3"
            style={{
              background: "rgba(59,130,246,0.12)",
              color: "var(--accent)",
              border: "1px solid rgba(59,130,246,0.25)",
            }}
          >
            <CameraIcon size={28} />
          </div>
          <div className="text-base font-medium">Tap to add photos</div>
          <div className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
            Take a photo or choose from your library
          </div>
        </label>
      ) : (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {current.photos.map((p, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
              >
                <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                {p.uploading && (
                  <div className="absolute inset-0 grid place-items-center bg-black/50 text-white text-xs">
                    Uploading…
                  </div>
                )}
                {p.error && (
                  <div
                    className="absolute inset-0 grid place-items-center text-white text-[11px] p-1 text-center"
                    style={{ background: "rgba(239,68,68,0.85)" }}
                  >
                    {p.error}
                  </div>
                )}
              </div>
            ))}
            {current.photos.length < 5 && (
              <label
                htmlFor="photo-input"
                onClick={() => console.log("[upload] + tapped")}
                className="aspect-square rounded-xl grid place-items-center cursor-pointer transition-all active:scale-[0.97]"
                style={{
                  border: "2px dashed var(--border-strong)",
                  color: "var(--accent)",
                  background: "rgba(59,130,246,0.05)",
                }}
              >
                <PlusIcon size={28} />
              </label>
            )}
          </div>
        </div>
      )}

      <input
        id="photo-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={false}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        onChange={(e) => {
          const fileList = e.target.files;
          console.log("[upload] files selected", fileList?.length);
          const arr = fileList ? Array.from(fileList) : [];
          e.target.value = "";
          handleFiles(arr);
        }}
      />

      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 text-sm px-3 py-2 rounded-lg z-40"
          style={{ background: "var(--bg-elev)", border: "1px solid var(--border)" }}
        >
          {toast}
        </div>
      )}

      {/* Sticky action bar — sits above the bottom tab bar. */}
      <div
        className="fixed inset-x-0 z-20 safe-bottom"
        style={{
          bottom: "var(--tab-h)",
          background: "rgba(15,17,23,0.9)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div className="max-w-lg mx-auto flex gap-2 p-3">
          <button
            onClick={() => setCurrent(newDraft())}
            className="btn flex-1"
          >
            Discard
          </button>
          <button
            onClick={nextItem}
            disabled={!canSubmit}
            className="btn btn-primary flex-[2]"
          >
            Next item →
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
import imageCompression from "browser-image-compression";

export async function compressForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1.2,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.85,
    });
    return new File([compressed], renameToJpg(file.name), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function renameToJpg(name: string) {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

"use client";
import type { Project, RenderJob } from "./types";
import { openaiHeaders } from "./keys";

export type ProjectView = Project & { lastRender: RenderJob | null };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export const post = <T,>(url: string, body: unknown, headers: Record<string, string> = {}) =>
  api<T>(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

export const fileUrl = (id: string, rel: string) => `/api/projects/${id}/file/${rel}`;

/** Upload with real progress (fetch can't report upload progress). */
export function uploadVideo(file: File, onProgress: (f: number) => void): { promise: Promise<string>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    for (const [k, v] of Object.entries(openaiHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(j.id);
        else reject(new Error(j.error || "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload canceled"));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

export function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

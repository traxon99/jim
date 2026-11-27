"use client";

import { Flashlight, Gallery, Keyboard, X } from "@/components/icons/solar";
import { codeReader, imageDataFromFile, sampleCardColors } from "@/lib/gym-cards/scan";
import type { ScannedCode } from "@jim/core";
import { useEffect, useRef, useState } from "react";

const GLASS_BUTTON =
  "press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md";

/** How often a camera frame is read for a code. */
const SCAN_EVERY_MS = 180;
/** Frames are scaled to this long side before reading; plenty for a card held up close. */
const FRAME_MAX = 1280;

export interface ScanResult extends ScannedCode {
  /** Colors sampled from the frame the code was found in, for the card. */
  colors: string[];
}

/**
 * The camera step of adding a gym card (issue #878): the back camera full
 * screen under a reticle, read a few times a second until a code turns up.
 * A photo or screenshot can be read instead, or the number typed. The camera
 * is asked for only when this opens, and stopped when it closes.
 */
export function GymCardScanner({
  onFound,
  onType,
  onClose,
}: {
  onFound: (result: ScanResult) => void;
  onType: () => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const found = useRef(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [torch, setTorch] = useState<"none" | "off" | "on">("none");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  useEffect(() => {
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    function stop() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      for (const track of stream.current?.getTracks() ?? []) track.stop();
      stream.current = null;
    }

    async function start() {
      const reader = codeReader();
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          for (const track of media.getTracks()) track.stop();
          return;
        }
        stream.current = media;
        const track = media.getVideoTracks()[0];
        // `torch` isn't in the DOM types yet; Android Chrome reports it.
        const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (capabilities?.torch) setTorch("off");
        const element = video.current;
        if (!element) return;
        element.srcObject = media;
        await element.play().catch(() => undefined);
      } catch {
        if (!cancelled) setCameraFailed(true);
        return;
      }
      const read = await reader.catch(() => null);
      if (!read || !context) return;

      const tick = async () => {
        const element = video.current;
        if (cancelled || found.current || !element) return;
        if (element.readyState >= 2 && element.videoWidth > 0) {
          const scale = Math.min(1, FRAME_MAX / Math.max(element.videoWidth, element.videoHeight));
          canvas.width = Math.round(element.videoWidth * scale);
          canvas.height = Math.round(element.videoHeight * scale);
          context.drawImage(element, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = await read(image).catch(() => null);
          if (code && !cancelled && !found.current) {
            found.current = true;
            navigator.vibrate?.(20);
            stop();
            onFoundRef.current({ ...code, colors: sampleCardColors(image) });
            return;
          }
        }
        if (!cancelled) timer.current = setTimeout(() => void tick(), SCAN_EVERY_MS);
      };
      void tick();
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === "none") return;
    const next = torch === "on" ? "off" : "on";
    try {
      await track.applyConstraints({
        advanced: [{ torch: next === "on" } as MediaTrackConstraintSet],
      });
      setTorch(next);
    } catch {
      setTorch("none");
    }
  }

  async function readPhoto(file: File | undefined) {
    if (!file || reading) return;
    setReading(true);
    setPhotoError(null);
    try {
      const [read, image] = await Promise.all([codeReader(), imageDataFromFile(file)]);
      const code = await read(image);
      if (!code) {
        setPhotoError("No code found in that picture");
        return;
      }
      found.current = true;
      onFoundRef.current({ ...code, colors: sampleCardColors(image) });
    } catch {
      setPhotoError("Couldn't read that picture");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black text-white">
      <video
        ref={video}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      {cameraFailed && (
        <p
          role="alert"
          className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-base text-white/80"
        >
          Camera unavailable
        </p>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-12 top-1/2 h-64 -translate-y-1/2"
      >
        <i className="absolute top-0 left-0 h-9 w-9 rounded-tl-[18px] border-t-4 border-l-4 border-white" />
        <i className="absolute top-0 right-0 h-9 w-9 rounded-tr-[18px] border-t-4 border-r-4 border-white" />
        <i className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-[18px] border-b-4 border-l-4 border-white" />
        <i className="absolute right-0 bottom-0 h-9 w-9 rounded-br-[18px] border-r-4 border-b-4 border-white" />
      </div>
      <div
        className="absolute inset-x-0 top-0 flex touch-none justify-between px-4"
        style={{ paddingTop: "max(16px, var(--top-inset))" }}
      >
        <button type="button" onClick={onClose} aria-label="Close" className={GLASS_BUTTON}>
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </button>
        {torch !== "none" && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label="Flashlight"
            aria-pressed={torch === "on"}
            className={`${GLASS_BUTTON} ${torch === "on" ? "bg-white! text-black!" : ""}`}
          >
            <Flashlight className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex touch-none flex-col items-center gap-3 px-4"
        style={{ paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 12px))" }}
      >
        {photoError && (
          <p role="alert" className="rounded-full bg-black/60 px-4 py-2 text-sm">
            {photoError}
          </p>
        )}
        <div className="flex gap-4">
          <label
            aria-label="Read a photo"
            data-ripple
            className={`${GLASS_BUTTON} cursor-pointer ${reading ? "opacity-50" : ""}`}
          >
            <Gallery className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={reading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void readPhoto(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={onType}
            aria-label="Type the number"
            className={GLASS_BUTTON}
          >
            <Keyboard className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

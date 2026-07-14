import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImageSize = { width: number; height: number };

const PREVIEW_SIZE = 256;
const OUTPUT_SIZE = 512;

export function LogoCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [processing, setProcessing] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const image = new Image();
    image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const preview = useMemo(() => {
    if (!imageSize) return null;
    const scale = Math.max(
      PREVIEW_SIZE / imageSize.width,
      PREVIEW_SIZE / imageSize.height,
    ) * zoom;
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    return {
      width,
      height,
      x: (offsetX / 100) * Math.max(0, (width - PREVIEW_SIZE) / 2),
      y: (offsetY / 100) * Math.max(0, (height - PREVIEW_SIZE) / 2),
    };
  }, [imageSize, offsetX, offsetY, zoom]);

  const crop = async () => {
    if (!imageSize || !imageUrl) return;
    setProcessing(true);
    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Kırpma alanı oluşturulamadı");

      const scale = Math.max(
        OUTPUT_SIZE / imageSize.width,
        OUTPUT_SIZE / imageSize.height,
      ) * zoom;
      const width = imageSize.width * scale;
      const height = imageSize.height * scale;
      const x = (OUTPUT_SIZE - width) / 2
        + (offsetX / 100) * Math.max(0, (width - OUTPUT_SIZE) / 2);
      const y = (OUTPUT_SIZE - height) / 2
        + (offsetY / 100) * Math.max(0, (height - OUTPUT_SIZE) / 2);

      context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      context.save();
      context.beginPath();
      context.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, x, y, width, height);
      context.restore();

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error("Logo işlenemedi")),
          "image/webp",
          0.92,
        );
      });
      const basename = file.name.replace(/\.[^.]+$/, "") || "logo";
      await onConfirm(new File([blob], `${basename}-512.webp`, { type: "image/webp" }));
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !preview) return;
    const maxX = Math.max(0, (preview.width - PREVIEW_SIZE) / 2);
    const maxY = Math.max(0, (preview.height - PREVIEW_SIZE) / 2);
    if (maxX > 0) {
      setOffsetX(Math.max(-100, Math.min(100, drag.offsetX + ((event.clientX - drag.startX) / maxX) * 100)));
    }
    if (maxY > 0) {
      setOffsetY(Math.max(-100, Math.min(100, drag.offsetY + ((event.clientY - drag.startY) / maxY) * 100)));
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Logoyu yuvarlak kırp">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-400/25 bg-slate-950 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-white">Logoyu yuvarlak kırp</h3>
            <p className="mt-1 text-xs text-slate-400">
              Sarı çemberin içi ilanlarda görünecek. Çıktı 512 × 512 WebP olarak kaydedilir.
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="mx-auto h-64 w-64 cursor-grab touch-none overflow-hidden rounded-full border-2 border-amber-400 bg-slate-900 shadow-[0_0_0_6px_rgba(245,197,24,0.08)] active:cursor-grabbing"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {preview && (
            <img
              src={imageUrl}
              alt="Kırpma önizlemesi"
              draggable={false}
              className="relative left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: preview.width,
                height: preview.height,
                transform: `translate(-50%, -50%) translate(${preview.x}px, ${preview.y}px)`,
              }}
            />
          )}
        </div>
        <p className="text-center text-[10px] text-slate-500">
          Logoyu parmağınızla/fareyle sürükleyin; yakınlaştırma çubuğuyla çemberi tamamen doldurun.
        </p>

        {imageSize?.width === 512 && imageSize.height === 512 && (
          <p className="text-center text-[11px] font-medium text-emerald-300">
            512 × 512 logo çerçeveye otomatik olarak tam oturtuldu.
          </p>
        )}

        <div className="space-y-3">
          <label className="block text-xs text-slate-300">
            Yakınlaştırma
            <input className="mt-1 w-full accent-amber-400" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-300">
              Yatay konum
              <input className="mt-1 w-full accent-amber-400" type="range" min="-100" max="100" step="1" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
            </label>
            <label className="block text-xs text-slate-300">
              Dikey konum
              <input className="mt-1 w-full accent-amber-400" type="range" min="-100" max="100" step="1" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={reset} disabled={processing}>
            <RotateCcw className="mr-1 h-4 w-4" /> Sıfırla
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={processing}>Vazgeç</Button>
          <Button type="button" onClick={() => void crop()} disabled={processing || !imageSize}>
            {processing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Kırp ve yükle
          </Button>
        </div>
      </div>
    </div>
  );
}

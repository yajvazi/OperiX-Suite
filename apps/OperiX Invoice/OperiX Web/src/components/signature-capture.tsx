"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Eraser, X } from "lucide-react";

interface SignatureCaptureProps {
  open: boolean;
  customerName?: string;
  onClose: () => void;
  onSave: (signature: string) => void;
}

export function SignatureCapture({ open, customerName, onClose, onSave }: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(pixelRatio, pixelRatio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#101828";
    setHasSignature(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const position = point(event);
    if (!canvas || !context || !position) return;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(position.x, position.y);
    drawingRef.current = true;
    setHasSignature(true);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const position = point(event);
    if (!context || !position) return;
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    onSave(canvas.toDataURL("image/png"));
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#101828]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-signature-title">
      <section className="card w-full max-w-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div>
            <h2 id="customer-signature-title" className="text-lg font-semibold">Customer signature</h2>
            <p className="muted mt-1 text-xs">Hand the phone to {customerName || "the customer"}. Their signature will appear alongside yours on the invoice.</p>
          </div>
          <button type="button" className="icon-btn ml-auto" onClick={onClose} aria-label="Close signature capture"><X size={18} /></button>
        </div>
        <div className="relative mt-5 overflow-hidden rounded-xl border border-[#d0d5dd] bg-white">
          <canvas
            ref={canvasRef}
            className="block h-52 w-full touch-none sm:h-60"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
            aria-label="Customer signature pad"
          />
          {!hasSignature ? <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#98a2b3]">Sign here</span> : null}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={clearCanvas}><Eraser size={16} /> Clear</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!hasSignature} onClick={saveSignature}><Check size={16} /> Use signature</button>
        </div>
      </section>
    </div>
  );
}

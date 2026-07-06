'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { X, Camera, RefreshCw, ZapOff } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const controlsRef  = useRef<IScannerControls | null>(null);
  const [error, setError]       = useState('');
  const [cameras, setCameras]   = useState<MediaDeviceInfo[]>([]);
  const [camIdx, setCamIdx]     = useState(0);
  const [scanning, setScanning] = useState(false);
  const scannedRef = useRef(false);

  const stopScan = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const startScan = useCallback(async (deviceId?: string) => {
    stopScan();
    if (!videoRef.current) return;
    setError('');
    setScanning(true);
    scannedRef.current = false;

    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        deviceId ?? undefined,
        videoRef.current,
        (result, err) => {
          if (result && !scannedRef.current) {
            scannedRef.current = true;
            stopScan();
            onScan(result.getText());
            onClose();
          }
          if (err && !(err instanceof NotFoundException)) {
            setError('Error al acceder a la cámara');
            setScanning(false);
          }
        },
      );
    } catch {
      setError('No se pudo iniciar la cámara. Verifica los permisos.');
      setScanning(false);
    }
  }, [stopScan, onScan, onClose]);

  useEffect(() => {
    let cancelled = false;

    BrowserMultiFormatReader.listVideoInputDevices()
      .then((devs) => {
        if (cancelled) return;
        setCameras(devs);
        const rearIdx = devs.findIndex(d => /back|rear|environment/i.test(d.label));
        const idx = rearIdx >= 0 ? rearIdx : 0;
        setCamIdx(idx);
        if (devs.length > 0) startScan(devs[idx]?.deviceId);
        else setError('No se encontró ninguna cámara');
      })
      .catch(() => { if (!cancelled) setError('No se pudo acceder a la cámara'); });

    return () => { cancelled = true; stopScan(); };
  }, [startScan, stopScan]);

  function switchCamera() {
    const next = (camIdx + 1) % cameras.length;
    setCamIdx(next);
    startScan(cameras[next]?.deviceId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-[#0a0a0a] rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-emerald-400" />
            <span className="text-[13px] font-semibold text-white">Escanear código</span>
          </div>
          <div className="flex items-center gap-2">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Cambiar cámara"
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Camera viewport */}
        <div className="relative mx-4 mb-4 rounded-xl overflow-hidden bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

          {scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-48">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-400 rounded-br-lg" />
                <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-400/60 animate-scan-line" />
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
              <ZapOff size={32} className="text-red-400" />
              <p className="text-[13px] text-slate-300">{error}</p>
              <button
                type="button"
                onClick={() => startScan(cameras[camIdx]?.deviceId)}
                className="px-4 py-2 bg-emerald-600 text-white text-[13px] font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-500 pb-5">
          Apunta al código de barras o QR del producto
        </p>
      </div>
    </div>
  );
}

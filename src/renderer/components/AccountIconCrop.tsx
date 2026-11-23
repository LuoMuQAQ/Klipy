import { useLayoutEffect, useRef, useState } from 'react';
import { Button, ModalBody, ModalFooter } from '@heroui/react';
import { t } from '../i18n';
import { drawAccountIcon, rasterizeAccountIcon } from '../utils/accountIcon';

interface Props {
  image: HTMLImageElement;
  onCancel: () => void;
  onConfirm: (icon: string) => void;
}

const clampCenter = (center: number, edge: number, size: number) =>
  Math.min(edge - size / 2, Math.max(size / 2, center));

export function AccountIconCrop({ image, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const { naturalWidth: width, naturalHeight: height } = image;
  const [view, setView] = useState({ x: width / 2, y: height / 2, zoom: 1 });
  const [error, setError] = useState('');
  const edge = Math.min(width, height);
  const size = edge / view.zoom;
  const x = view.x - size / 2;
  const y = view.y - size / 2;

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    try {
      drawAccountIcon(canvasRef.current, image, { x, y, size });
    } catch {
      setError(t('iconConvertFailed'));
    }
  }, [image, x, y, size]);

  function move(dx: number, dy: number) {
    setView((previous) => {
      const cropSize = edge / previous.zoom;
      return {
        ...previous,
        x: clampCenter(previous.x + dx * cropSize, width, cropSize),
        y: clampCenter(previous.y + dy * cropSize, height, cropSize),
      };
    });
  }

  function confirm() {
    let icon: string;
    try {
      icon = rasterizeAccountIcon(image, { x, y, size });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('iconConvertFailed'));
      return;
    }
    onConfirm(icon);
  }

  return (
    <>
      <ModalBody className="gap-2.5 py-2" data-icon-crop="true">
        <div className="relative mx-auto aspect-square w-full max-w-[192px] overflow-hidden rounded-medium bg-default-100">
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            tabIndex={0}
            aria-label={t('cropIcon')}
            aria-description={t('cropIconHelp')}
            className="block h-full w-full touch-none cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
            onPointerDown={(event) => {
              if (event.button !== 0 || drag.current) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (start?.id !== event.pointerId) return;
              const side = event.currentTarget.getBoundingClientRect().width;
              if (!side) return;
              move((start.x - event.clientX) / side, (start.y - event.clientY) / side);
              drag.current = { id: start.id, x: event.clientX, y: event.clientY };
            }}
            onLostPointerCapture={(event) => {
              if (drag.current?.id === event.pointerId) drag.current = null;
            }}
            onKeyDown={(event) => {
              const arrows: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
              };
              const direction = arrows[event.key];
              if (!direction) return;
              event.preventDefault();
              move(direction[0] * 0.04, direction[1] * 0.04);
            }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-white/80 shadow-[0_0_0_96px_rgba(0,0,0,0.42)]" />
        </div>
        <label className="flex items-center gap-3 text-xs text-default-700">
          <span>{t('cropIconZoom')}</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={view.zoom}
            className="min-w-0 flex-1 accent-primary"
            onChange={(event) => {
              const zoom = Number(event.currentTarget.value);
              setView((previous) => ({
                x: clampCenter(previous.x, width, edge / zoom),
                y: clampCenter(previous.y, height, edge / zoom),
                zoom,
              }));
            }}
          />
          <span aria-hidden className="w-10 text-right tabular-nums">{Math.round(view.zoom * 100)}%</span>
        </label>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </ModalBody>
      <ModalFooter className="pt-2">
        <Button id="cancel-icon-crop-btn" size="sm" variant="light" onPress={onCancel}>{t('cancel')}</Button>
        <Button id="confirm-icon-crop-btn" size="sm" color="primary" onPress={confirm}>{t('useIconCrop')}</Button>
      </ModalFooter>
    </>
  );
}

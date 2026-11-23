import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';

const PERIOD_MS = 30_000;
const SECOND_MS = 1_000;
const MAX_PHASE_DRIFT_MS = 50;

interface TotpProgressProps {
  onTick: (unixSeconds: number) => void;
}

export function TotpProgress({ onTick }: TotpProgressProps) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(() => Math.ceil((PERIOD_MS - Date.now() % PERIOD_MS) / SECOND_MS));

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;

    // Animate only the transform; layout and React don't have to run on every frame.
    const animation = indicator.animate(
      [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
      { duration: PERIOD_MS, easing: 'linear', iterations: Infinity },
    );
    let timer: number;

    function update(forceSync = false) {
      window.clearTimeout(timer);
      const now = Date.now();
      const elapsed = now % PERIOD_MS;
      const animationTime = typeof animation.currentTime === 'number' ? animation.currentTime : 0;
      const drift = Math.abs(animationTime % PERIOD_MS - elapsed);
      if (forceSync || Math.min(drift, PERIOD_MS - drift) > MAX_PHASE_DRIFT_MS) {
        animation.currentTime = elapsed;
      }

      setSeconds(Math.ceil((PERIOD_MS - elapsed) / SECOND_MS));
      onTick(Math.floor(now / SECOND_MS));
      timer = window.setTimeout(update, SECOND_MS - now % SECOND_MS);
    }

    // Resync the compositor timeline after restoring the window or a clock change.
    const handleVisibilityChange = () => update(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    update(true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      animation.cancel();
    };
  }, [onTick]);

  const color = seconds <= 5 ? 'bg-danger' : seconds <= 10 ? 'bg-warning' : 'bg-primary';

  return (
    <div
      role="progressbar"
      aria-label={t('standardPeriod')}
      aria-valuemin={0}
      aria-valuemax={PERIOD_MS / SECOND_MS}
      aria-valuenow={seconds}
      aria-valuetext={t('remainingSeconds', { count: seconds })}
      className="h-1 w-full shrink-0 overflow-hidden bg-default-200"
    >
      <div ref={indicatorRef} data-slot="indicator" className={`h-full w-full origin-left ${color}`} />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Loader, PauseCircle, PlayCircle } from 'lucide-react';

const DURATIONS = [
  { minutes: 60, label: 'ساعة' },
  { minutes: 180, label: '٣ ساعات' },
  { minutes: null, label: 'لين أفتحها' },
];

function untilLabel(until) {
  if (!until) return 'لين تفتحها';
  const d = new Date(until);
  const sameDay = d.toDateString() === new Date().toDateString();
  return `لين ${d.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' })}${
    sameDay ? '' : ` ${d.toLocaleDateString('ar-SA', { weekday: 'long' })}`
  }`;
}

// The shop's "open for orders" switch. Pausing asks for how long and an
// optional word for customers; reopening is one click, because a shop that
// forgot to reopen is losing orders.
export default function OrdersPauseControl({ authedFetch, claim, onChanged, compact = false }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);

  // A timed pause ends on the server by itself; refresh when it does so the
  // switch doesn't keep saying "paused".
  useEffect(() => {
    const until = claim?.ordersPause?.until;
    if (!until) return undefined;
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0 || ms > 2 ** 31 - 1) return undefined;
    const t = setTimeout(onChanged, ms + 1000);
    return () => clearTimeout(t);
  }, [claim?.ordersPause?.until, onChanged]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!claim) return null;
  const pause = claim.ordersPause;

  async function save(body) {
    setBusy(true);
    setError('');
    const res = await authedFetch(`/vendor/places/${claim.placeId}/orders`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!res) return;
    if (!res.ok) {
      setError('ما قدرنا نحفظ، جرّب مرة ثانية.');
      return;
    }
    setOpen(false);
    setNote('');
    onChanged();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (pause ? save({ paused: false }) : setOpen((o) => !o))}
        disabled={busy}
        title={pause ? 'اضغط لتفتح الطلبات' : 'اضغط لتوقف الطلبات مؤقتاً'}
        className={`w-full flex items-center gap-2 rounded-xl text-start font-semibold disabled:opacity-60 ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2.5 text-sm'
        } ${pause ? 'bg-amber-100 text-amber-900' : 'bg-primary/10 text-primary'}`}
      >
        {busy ? (
          <Loader className="w-4 h-4 animate-spin shrink-0" />
        ) : pause ? (
          <PauseCircle className="w-4 h-4 shrink-0" />
        ) : (
          <PlayCircle className="w-4 h-4 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="block truncate">{pause ? 'الطلبات متوقفة' : 'تستقبل الطلبات'}</span>
          {pause && !compact && <span className="block text-[11px] font-normal">{untilLabel(pause.until)} · اضغط للفتح</span>}
        </span>
      </button>

      {open && (
        <div className={`absolute z-40 mt-2 w-72 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant p-4 space-y-3 ${compact ? 'end-0' : 'start-0'}`}>
          <p className="text-sm font-bold">إيقاف الطلبات مؤقتاً</p>
          <p className="text-xs text-on-surface-variant">
            محلك يضل ظاهر في ريكو، بس العملاء ما يقدروا يطلبوا منه لحد ما تفتح.
          </p>
          <div className="flex gap-1 bg-surface-container rounded-xl p-1 text-xs font-bold">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                onClick={() => setMinutes(d.minutes)}
                className={`flex-1 px-2 py-1.5 rounded-lg ${
                  minutes === d.minutes ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'bg-transparent text-on-surface-variant'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
            placeholder="كلمة للعملاء (اختياري): مسكّرين للجرد"
            className="w-full bg-surface-container border-none rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            onClick={() => save({ paused: true, minutes, ...(note.trim() ? { note: note.trim() } : {}) })}
            disabled={busy}
            className="w-full bg-on-surface text-surface py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
          >
            أوقف الطلبات
          </button>
        </div>
      )}
    </div>
  );
}

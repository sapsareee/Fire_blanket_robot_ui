const LOG_TONES = {
  ALERT: {
    border: "border-rose-400/30",
    badge: "bg-rose-400 text-rose-950",
    dot: "bg-rose-400",
  },
  WARN: {
    border: "border-amber-400/30",
    badge: "bg-amber-400 text-amber-950",
    dot: "bg-amber-400",
  },
  INFO: {
    border: "border-sky-400/25",
    badge: "bg-sky-400 text-sky-950",
    dot: "bg-sky-400",
  },
};

export default function EventLogPanel({ logs, expanded = false }) {
  const visibleLogs = expanded ? logs : logs.slice(0, 7);

  return (
    <section className="rounded-xl border border-white/[0.12] bg-[#191e28] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-slate-100">Trigger Log</h2>
        <span className="text-[8px] text-slate-500">{logs.length} EVENTS</span>
      </div>

      {visibleLogs.length === 0 ? (
        <div className="flex min-h-[64px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-slate-500">
          센서 상태 변경 및 경고 이벤트 대기 중
        </div>
      ) : expanded ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleLogs.map((log) => {
            const tone = LOG_TONES[log.level] || LOG_TONES.INFO;
            return (
              <div
                key={log.id}
                className={`rounded-lg border bg-[#202631] p-3 ${tone.border}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${tone.badge}`}>
                    {log.level}
                  </span>
                  <span className="font-mono text-[8px] text-slate-500">{log.time}</span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-200">{log.text}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative overflow-x-auto pb-1">
          <div className="absolute bottom-[8px] left-2 right-2 h-px bg-slate-600/70" />
          <div className="flex min-w-max gap-2">
            {visibleLogs.map((log) => {
              const tone = LOG_TONES[log.level] || LOG_TONES.INFO;
              return (
                <div key={log.id} className="relative w-[155px] pb-4">
                  <div className={`h-[42px] rounded-lg border bg-[#202631] px-2 py-1.5 ${tone.border}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1 py-0.5 text-[7px] font-bold ${tone.badge}`}>
                        {log.level}
                      </span>
                      <span className="font-mono text-[7px] text-slate-400">{log.time}</span>
                    </div>
                    <p className="mt-1 truncate text-[8px] text-slate-200" title={log.text}>
                      {log.text}
                    </p>
                  </div>
                  <span className={`absolute bottom-[5px] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-[#191e28] ${tone.dot}`} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

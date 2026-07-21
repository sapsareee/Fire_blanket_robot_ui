import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "events", label: "이벤트 로그" },
  { key: "overview", label: "시스템 개요" },
];

const formatClock = (date) =>
  [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

const formatDate = (date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) =>
      index === 0 ? String(value) : String(value).padStart(2, "0")
    )
    .join(".");

export default function DashboardLayout({
  activeTab,
  onTabChange,
  bridgeStatus,
  onReconnectBridge,
  children,
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const bridgeTone =
    bridgeStatus === "connected"
      ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
      : bridgeStatus === "reconnecting" || bridgeStatus === "connecting"
        ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]"
        : "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.7)]";

  return (
    <div className="min-h-screen bg-[#0b0f16] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[46px_minmax(0,1fr)] md:grid-rows-[38px_1fr]">
        <header className="col-span-1 flex min-h-[38px] items-center border-b border-white/[0.06] bg-[#171c26] md:col-span-2">
          <div className="flex h-full w-12 shrink-0 items-center justify-center text-sm font-bold tracking-wide text-white">
            FR
          </div>
          <nav className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`relative whitespace-nowrap px-3 text-[11px] transition md:px-4 ${
                  activeTab === item.key
                    ? "text-emerald-300"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {item.label}
                {activeTab === item.key && (
                  <span className="absolute inset-x-2 bottom-0 h-px bg-emerald-300" />
                )}
              </button>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-3 px-4 text-right sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${bridgeTone}`} />
            <div className="font-mono text-[9px] leading-tight text-slate-300">
              <div>{formatClock(now)}</div>
              <div className="text-slate-500">{formatDate(now)}</div>
            </div>
          </div>
        </header>

        <aside className="hidden flex-col items-center border-r border-white/[0.06] bg-[#111620] py-3 md:flex">
          <button
            type="button"
            onClick={() => onTabChange("home")}
            aria-label="대시보드"
            className={`grid h-8 w-8 place-items-center rounded-md text-base transition ${
              activeTab === "home"
                ? "bg-emerald-400/15 text-emerald-300"
                : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            ▦
          </button>
          <button
            type="button"
            onClick={() => onTabChange("overview")}
            aria-label="시스템 개요"
            className="mt-2 grid h-8 w-8 place-items-center rounded-md text-sm text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
          >
            ◉
          </button>
          <button
            type="button"
            onClick={() => onTabChange("events")}
            aria-label="이벤트 로그"
            className="mt-2 grid h-8 w-8 place-items-center rounded-md text-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
          >
            ⌁
          </button>

          <div className="mt-auto flex flex-col items-center gap-2 border-t border-white/[0.06] pt-3">
            <span className="text-xs text-slate-500">ⓘ</span>
            <button
              type="button"
              onClick={onReconnectBridge}
              aria-label="ROS Bridge 재연결"
              title="ROS Bridge 재연결"
              className="grid h-8 w-8 place-items-center rounded-md text-base text-slate-500 transition hover:bg-white/5 hover:text-emerald-300"
            >
              ↻
            </button>
          </div>
        </aside>

        <main className="min-w-0 overflow-x-hidden bg-[radial-gradient(circle_at_50%_-20%,rgba(42,52,72,0.35),transparent_42%),#0d121a] p-2.5 sm:p-3 md:p-3.5">
          {children}
        </main>
      </div>
    </div>
  );
}

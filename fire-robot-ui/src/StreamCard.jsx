const statusTone = (connected, shouldLoad) => {
  if (connected) return "border-emerald-400/30 bg-emerald-400/15 text-emerald-300";
  if (shouldLoad) return "border-amber-400/30 bg-amber-400/15 text-amber-300";
  return "border-rose-400/30 bg-rose-400/15 text-rose-300";
};

export default function StreamCard({
  title,
  caption,
  type,
  src,
  reloadKey,
  shouldLoad,
  connected,
  status,
  metric,
  onLoad,
  onLoadStart,
  onCanPlay,
  onError,
  onReload,
}) {
  return (
    <article className="group relative aspect-[16/10] min-h-[180px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#171c26] shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
      {shouldLoad ? (
        type === "video" ? (
          <video
            key={reloadKey}
            src={src}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
            autoPlay
            loop
            muted
            playsInline
            onLoadStart={onLoadStart}
            onCanPlay={onCanPlay}
            onError={onError}
          />
        ) : (
          <img
            key={reloadKey}
            src={src}
            alt={`${title} stream`}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
            onLoad={onLoad}
            onError={onError}
          />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[linear-gradient(135deg,#161c27,#0d1118)] px-6 text-center">
          <span className="mb-2 text-2xl text-slate-600">⌁</span>
          <p className="text-xs font-medium text-slate-300">{title}</p>
          <p className="mt-1 text-[10px] text-slate-500">ROS 토픽 연결 대기 중</p>
        </div>
      )}

      {shouldLoad && !connected && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center bg-[#111720]/80 text-center backdrop-blur-[1px]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-300" />
          <span className="mt-2 text-[9px] font-medium tracking-wide text-amber-300">
            STREAM CONNECTING
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/65 via-transparent to-black/10" />

      <div className="absolute left-2.5 top-2.5 z-[3] rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-medium text-white backdrop-blur">
        {title}
      </div>
      {metric && (
        <div className="absolute right-2.5 top-2.5 z-[3] rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[9px] font-mono text-white backdrop-blur">
          {metric}
        </div>
      )}

      <button
        type="button"
        onClick={onReload}
        aria-label={`${title} 재연결`}
        title="스트림 재연결"
        className="absolute right-2.5 top-9 z-[3] grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-black/45 text-xs text-slate-300 opacity-0 backdrop-blur transition hover:text-emerald-300 group-hover:opacity-100 focus:opacity-100"
      >
        ↻
      </button>

      <div className="absolute inset-x-2.5 bottom-2.5 z-[3] flex items-center justify-between gap-2">
        <span className="rounded-md bg-black/55 px-2 py-1 text-[9px] font-medium text-white backdrop-blur">
          {caption}
        </span>
        <span
          className={`rounded-md border px-2 py-1 text-[8px] font-semibold ${statusTone(
            connected,
            shouldLoad
          )}`}
        >
          {status}
        </span>
      </div>
    </article>
  );
}

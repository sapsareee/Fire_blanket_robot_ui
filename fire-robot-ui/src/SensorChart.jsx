const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildSparkline = (series, min, max) => {
  if (!series.length) return "";
  const width = 320;
  const height = 76;
  const range = max - min || 1;
  return series
    .map((point, index) => {
      const x = series.length === 1 ? 0 : (index / (series.length - 1)) * width;
      const normalized = clamp((point.value - min) / range, 0, 1);
      const y = 6 + (1 - normalized) * (height - 12);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

const toneClasses = {
  normal: {
    stroke: "#4ade80",
    badge: "bg-emerald-400/10 text-emerald-300",
  },
  warm: {
    stroke: "#fbbf24",
    badge: "bg-amber-400/10 text-amber-300",
  },
  alert: {
    stroke: "#fb7185",
    badge: "bg-rose-400/10 text-rose-300",
  },
  unknown: {
    stroke: "#64748b",
    badge: "bg-slate-400/10 text-slate-400",
  },
};

export default function SensorChart({
  title,
  label,
  value,
  unit,
  secondaryValue,
  percentage,
  status,
  tone = "normal",
  series = [],
  min,
  max,
  wide = false,
  controls,
}) {
  const colors = toneClasses[tone] || toneClasses.unknown;
  const gaugePercentage = percentage === null ? 0 : clamp(percentage, 0, 100);
  const sparklinePath = buildSparkline(series, min, max);

  return (
    <article className="flex min-h-[158px] flex-col rounded-xl border border-white/[0.12] bg-[#191e28] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold text-slate-100">{title}</h2>
        {controls}
      </div>

      <div className={`mt-1 flex flex-1 items-center gap-3 ${wide ? "sm:gap-6" : "justify-center"}`}>
        <div className="relative w-[130px] shrink-0">
          <svg viewBox="0 0 180 112" className="w-full" aria-hidden="true">
            <path
              d="M 28 91 A 62 62 0 0 1 152 91"
              fill="none"
              stroke="#303642"
              strokeWidth="12"
              strokeLinecap="round"
              pathLength="100"
            />
            <path
              d="M 28 91 A 62 62 0 0 1 152 91"
              fill="none"
              stroke={colors.stroke}
              strokeWidth="12"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${gaugePercentage} 100`}
              className="transition-all duration-500"
            />
            <text
              x="90"
              y="77"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="30"
              fontWeight="700"
            >
              {value === null ? "--" : `${value}${unit}`}
            </text>
            {secondaryValue && (
              <text
                x="90"
                y="98"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="12"
              >
                {secondaryValue}
              </text>
            )}
          </svg>
          <div className="-mt-1 flex items-center justify-between text-[9px] text-slate-400">
            <span>{label}</span>
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${colors.badge}`}>
              {status}
            </span>
          </div>
        </div>

        {wide && (
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="mb-1 flex items-center justify-between text-[8px] text-slate-500">
              <span>HISTORY</span>
              <span>{series.at(-1)?.label || "NO DATA"}</span>
            </div>
            <svg viewBox="0 0 320 76" className="h-[76px] w-full overflow-visible">
              {[0, 1, 2].map((line) => (
                <line
                  key={line}
                  x1="0"
                  x2="320"
                  y1={10 + line * 26}
                  y2={10 + line * 26}
                  stroke="rgba(148,163,184,0.10)"
                />
              ))}
              {sparklinePath ? (
                <path
                  d={sparklinePath}
                  fill="none"
                  stroke={colors.stroke}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <text x="160" y="42" textAnchor="middle" fill="#64748b" fontSize="10">
                  센서 데이터 수신 대기 중
                </text>
              )}
            </svg>
          </div>
        )}
      </div>
    </article>
  );
}

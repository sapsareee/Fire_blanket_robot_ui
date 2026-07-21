const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildSparkline = (series, min, max) => {
  if (!series.length) return "";
  const width = 150;
  const height = 24;
  const range = max - min || 1;
  return series
    .map((point, index) => {
      const x = series.length === 1 ? 0 : (index / (series.length - 1)) * width;
      const normalized = clamp((point.value - min) / range, 0, 1);
      const y = 2 + (1 - normalized) * (height - 4);
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
  square = false,
  roundedGauge = false,
  controls,
}) {
  const colors = toneClasses[tone] || toneClasses.unknown;
  const gaugePercentage = percentage === null ? 0 : clamp(percentage, 0, 100);
  const sparklinePath = buildSparkline(series, min, max);
  const usesRoundedGauge = square || roundedGauge;
  const gaugePath = usesRoundedGauge
    ? "M 47.1 112 A 56 56 0 1 1 132.9 112"
    : "M 27 94 A 63 63 0 0 1 153 94";

  return (
    <article
      className={`relative h-[237px] min-h-[237px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#1b202b] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.025)] ${
        square
          ? "w-[237px] justify-self-center sm:justify-self-start"
          : "w-full"
      }`}
    >
      <div className="relative z-10 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[-0.01em] text-slate-100">
          {title}
        </h2>
        {controls && <div className="opacity-80 transition hover:opacity-100">{controls}</div>}
      </div>

      <div
        className={`absolute ${
          square
            ? "left-1/2 top-[28px] w-[252px] -translate-x-1/2"
            : roundedGauge
              ? "left-3 top-[28px] w-[200px]"
            : wide
              ? "left-3 top-[25px] w-[150px]"
              : "left-1/2 top-[25px] w-[150px] -translate-x-1/2"
        }`}
      >
          <svg
            viewBox={usesRoundedGauge ? "0 0 180 128" : "0 0 180 116"}
            className="w-full"
            aria-hidden="true"
          >
            <path
              d={gaugePath}
              fill="none"
              stroke="#303641"
              strokeWidth={usesRoundedGauge ? "6" : "11"}
              strokeLinecap="round"
              pathLength="100"
            />
            <path
              d={gaugePath}
              fill="none"
              stroke={colors.stroke}
              strokeWidth={usesRoundedGauge ? "6" : "11"}
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${gaugePercentage} 100`}
              className="transition-all duration-500"
            />
            <text
              x="90"
              y="78"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize={square ? "25.6" : roundedGauge ? "22.4" : "32"}
              fontWeight="700"
            >
              {value === null ? "--" : `${value}${unit}`}
            </text>
            {secondaryValue && (
              <text
                x="90"
                y="101"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="12"
              >
                {secondaryValue}
              </text>
            )}
          </svg>
      </div>

      {wide && (
        <div
          className={`absolute ${
            roundedGauge
              ? "left-[22px] top-[158px] w-[170px]"
              : "left-[18px] top-[119px] w-[145px]"
          }`}
        >
          <svg viewBox="0 0 150 24" className="h-6 w-full overflow-visible" aria-label="최근 센서 추이">
            <line
              x1="0"
              x2="150"
              y1="20"
              y2="20"
              stroke="rgba(148,163,184,0.12)"
            />
            {sparklinePath && (
              <>
                <path
                  d={sparklinePath}
                  fill="none"
                  stroke={colors.stroke}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.12"
                />
                <path
                  d={sparklinePath}
                  fill="none"
                  stroke={colors.stroke}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {!sparklinePath && (
              <line
                x1="0"
                x2="150"
                y1="12"
                y2="12"
                stroke={colors.stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.35"
              />
            )}
          </svg>
        </div>
      )}

      <div
        className={`absolute bottom-2.5 left-3 flex items-center justify-between text-[9px] text-slate-400 ${
          roundedGauge ? "w-[200px]" : wide ? "w-[150px]" : "right-3"
        }`}
      >
        <span>{label}</span>
        <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${colors.badge}`}>
          {status}
        </span>
      </div>
    </article>
  );
}

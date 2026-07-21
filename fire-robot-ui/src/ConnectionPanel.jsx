import rosIcon from "./assets/icons/icon-ros.svg";

const connectionTone = (connected) =>
  connected
    ? {
        dot: "bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.75)]",
        text: "text-emerald-300",
      }
    : {
        dot: "bg-rose-400 shadow-[0_0_7px_rgba(251,113,133,0.65)]",
        text: "text-rose-300",
      };

function ConnectionTile({ icon, name, connected, status }) {
  const tone = connectionTone(connected);
  const isImageSource =
    typeof icon === "string" &&
    (icon.startsWith("data:image/") ||
      icon.startsWith("blob:") ||
      icon.startsWith("http://") ||
      icon.startsWith("https://") ||
      icon.startsWith("/") ||
      icon.includes(".svg"));

  return (
    <div className="relative flex min-h-[54px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-white/[0.1] bg-[#202631] px-1.5 py-1.5 text-center shadow-inner shadow-black/10">
      <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {isImageSource ? (
        <img
          src={icon}
          alt=""
          className="mb-1 block h-4 w-4 shrink-0 object-contain opacity-90"
        />
      ) : (
        <span className="mb-1 text-sm text-slate-200">{icon}</span>
      )}
      <span className="max-w-full truncate text-[8px] font-medium leading-tight text-slate-100">
        {name}
      </span>
      <span className={`mt-0.5 text-[7px] font-semibold leading-none ${tone.text}`}>
        {status}
      </span>
    </div>
  );
}

export default function ConnectionPanel({
  rosConnected,
  bridgeStatus,
  items,
  fireDetected,
}) {
  const fireKnown = fireDetected !== null;
  const fireSafe = fireDetected === false;

  const tiles = [
    {
      key: "ros",
      icon: rosIcon,
      name: "ROS Bridge",
      connected: rosConnected,
      status: rosConnected ? "CONNECTED" : bridgeStatus.toUpperCase(),
    },
    ...items,
    {
      key: "fire",
      icon: "♨",
      name: "Fire Detection",
      connected: fireKnown && fireSafe,
      status: fireDetected === true ? "ALERT" : fireSafe ? "NORMAL" : "UNKNOWN",
    },
  ];

  return (
    <section className="flex min-h-[237px] flex-col rounded-xl border border-white/[0.12] bg-[#191e28] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-slate-100">
          Sensor Connection Status
        </h2>
        <span className="text-[8px] text-slate-500">
          {tiles.filter((tile) => tile.connected).length}/{tiles.length} ONLINE
        </span>
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <ConnectionTile key={tile.key} {...tile} />
        ))}
      </div>
    </section>
  );
}

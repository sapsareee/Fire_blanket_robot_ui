import { useEffect, useMemo, useState } from "react";
import * as ROSLIB from "roslib";

const ROSBRIDGE_URL = "ws://localhost:9090";
const TIMEOUT_MS = 4000;
const CHECK_INTERVAL_MS = 1000;

const TOPIC_CONFIG = [
  { key: "autonomy", name: "자율주행", topic: "/autonomy/status" },
  { key: "thermal_camera", name: "열화상 카메라", topic: "/thermal_camera/status" },
  { key: "vision_sensor", name: "비전 센서", topic: "/vision_sensor/status" },
  { key: "battery_sensor", name: "배터리 센서", topic: "/battery_sensor/status" },
  { key: "temperature_sensor", name: "온도센서", topic: "/temperature_sensor/status" },
];

const createInitialTopicState = () =>
  TOPIC_CONFIG.reduce((acc, item) => {
    acc[item.key] = {
      value: false,
      lastSeen: 0,
      timedOut: true,
    };
    return acc;
  }, {});

export default function FireRobotDashboard() {
  const [rosConnected, setRosConnected] = useState(false);
  const [thermalReloadKey, setThermalReloadKey] = useState(0);
  const [thermalImageOk, setThermalImageOk] = useState(false);
  const [topicStates, setTopicStates] = useState(createInitialTopicState());

  const batteryData = [62, 60, 59, 57, 56, 54, 53, 51, 50, 48, 47, 45];
  const tempData = [38, 39, 41, 42, 43, 45, 47, 46, 48, 49, 50, 52];

  const logs = [
    { time: "14:21:08", level: "INFO", text: "자율주행 경로 추종 정상 동작" },
    { time: "14:21:15", level: "INFO", text: "비전 카메라 스트림 수신 시작" },
    { time: "14:21:32", level: "WARN", text: "배터리 센서 응답 지연 감지" },
    { time: "14:21:49", level: "INFO", text: "열화상 카메라 연결 상태 정상" },
    { time: "14:22:11", level: "ALERT", text: "온도 상승 트리거 발생: 전면 차폐판 82°C" },
    { time: "14:22:16", level: "INFO", text: "이벤트 로그 저장 완료" },
  ];

  // ROS2 web_video_server 사용 예시
  // 예: ros2 run web_video_server web_video_server
  // 브라우저에서 접근 가능한 주소로 바꾸세요.
  const thermalStreamUrl =
    "http://localhost:8080/stream?topic=/thermal/image&qos_profile=sensor_data";

  useEffect(() => {
    const ros = new ROSLIB.Ros({
      url: ROSBRIDGE_URL,
    });

    let isUnmounted = false;
    const subscribers = [];

    ros.on("connection", () => {
      if (isUnmounted) return;
      setRosConnected(true);
      console.log("[ROS] rosbridge connected");
    });

    ros.on("error", (error) => {
      if (isUnmounted) return;
      setRosConnected(false);
      console.error("[ROS] rosbridge error:", error);
    });

    ros.on("close", () => {
      if (isUnmounted) return;
      setRosConnected(false);
      console.warn("[ROS] rosbridge closed");

      // rosbridge 연결이 끊긴 경우 전체를 timeout/disconnect 취급
      setTopicStates((prev) => {
        const next = { ...prev };
        for (const cfg of TOPIC_CONFIG) {
          next[cfg.key] = {
            ...next[cfg.key],
            timedOut: true,
          };
        }
        return next;
      });
    });

    TOPIC_CONFIG.forEach((cfg) => {
      const topic = new ROSLIB.Topic({
        ros,
        name: cfg.topic,
        messageType: "std_msgs/msg/Bool",
      });

      topic.subscribe((message) => {
        if (isUnmounted) return;

        setTopicStates((prev) => ({
          ...prev,
          [cfg.key]: {
            value: Boolean(message.data),
            lastSeen: Date.now(),
            timedOut: false,
          },
        }));
      });

      subscribers.push(topic);
    });

    const timeoutChecker = setInterval(() => {
      const now = Date.now();

      setTopicStates((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const cfg of TOPIC_CONFIG) {
          const current = prev[cfg.key];
          const isTimedOut =
            !current.lastSeen || now - current.lastSeen > TIMEOUT_MS;

          if (current.timedOut !== isTimedOut) {
            next[cfg.key] = {
              ...current,
              timedOut: isTimedOut,
            };
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, CHECK_INTERVAL_MS);

    return () => {
      isUnmounted = true;
      clearInterval(timeoutChecker);

      subscribers.forEach((topic) => {
        try {
          topic.unsubscribe();
        } catch (e) {
          console.warn("[ROS] unsubscribe failed:", e);
        }
      });

      try {
        ros.close();
      } catch (e) {
        console.warn("[ROS] close failed:", e);
      }
    };
  }, []);

  const connectionItems = useMemo(() => {
    return TOPIC_CONFIG.map((cfg) => {
      const state = topicStates[cfg.key];
      const isAlive = state && !state.timedOut && state.value === true;

      return {
        name: cfg.name,
        status: isAlive ? "connect" : "disconnect",
        detail: state?.timedOut
          ? "timeout (4초 이상 무응답)"
          : state?.value
          ? "Bool true 수신 중"
          : "Bool false 수신",
      };
    });
  }, [topicStates]);

  const thermalTopicAlive = useMemo(() => {
    const state = topicStates.thermal_camera;
    return state && !state.timedOut && state.value === true;
  }, [topicStates]);


  const linePath = (data, width = 320, height = 160, padding = 16) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    return data
      .map((v, i) => {
        const x = padding + (i * (width - padding * 2)) / (data.length - 1);
        const y =
          height - padding - ((v - min) / range) * (height - padding * 2);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  };

  const statusStyle = (status) =>
    status === "connect"
      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
      : "bg-rose-500/15 text-rose-300 border border-rose-400/30";

  const levelStyle = (level) => {
    if (level === "ALERT")
      return "text-rose-300 border-rose-400/30 bg-rose-500/10";
    if (level === "WARN")
      return "text-amber-300 border-amber-400/30 bg-amber-500/10";
    return "text-sky-300 border-sky-400/30 bg-sky-500/10";
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#1d4b4b,_#0b1220_35%,_#09111b_70%)] p-4 md:p-6 text-white">
      <div className="mx-auto max-w-[1600px] rounded-[30px] border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl overflow-hidden">
        <div className="grid min-h-[90vh] grid-cols-1 xl:grid-cols-[96px_minmax(0,1fr)_320px]">
          <aside className="border-b xl:border-b-0 xl:border-r border-white/10 bg-slate-950/70 p-3 md:p-4 flex xl:flex-col items-center xl:items-stretch justify-between gap-3">
            <div className="flex xl:flex-col items-center gap-3 w-full">
              <div className="h-12 w-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/20 flex items-center justify-center text-cyan-300 font-semibold text-lg">
                FR
              </div>
              <button className="w-full rounded-2xl bg-blue-500/20 border border-blue-400/30 px-3 py-3 text-sm font-medium text-blue-200 shadow-inner shadow-blue-500/10">
                Dashboard
              </button>
            </div>
            <div className="hidden xl:block rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-[11px] text-slate-300">
              Live Monitoring
            </div>
          </aside>

          <main className="p-4 md:p-6 lg:p-7">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="rounded-[26px] border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/20">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg md:text-xl font-semibold">
                      센서 모니터링
                    </h2>
                    <p className="text-sm text-slate-400">
                      ROS2 열화상 스트림 표시
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        thermalImageOk
                          ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                          : "border border-rose-400/30 bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {thermalImageOk ? "LIVE" : "DISCONNECTED"}
                    </span>

                    <button
                      onClick={() => {
                        setThermalImageOk(false);
                        setThermalReloadKey((v) => v + 1);
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                    >
                      재연결
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-3 py-1 ${
                      rosConnected
                        ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                        : "border border-rose-400/30 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    rosbridge {rosConnected ? "connected" : "disconnected"}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 ${
                      thermalTopicAlive
                        ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                        : "border border-rose-400/30 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    thermal status topic{" "}
                    {thermalTopicAlive ? "alive" : "timeout/disconnect"}
                  </span>
                </div>

                <div className="aspect-video w-full rounded-2xl border border-white/10 bg-black overflow-hidden relative">
                  <img
                    key={thermalReloadKey}
                    src={`${thermalStreamUrl}&reload=${thermalReloadKey}`}
                    alt="ROS2 thermal stream"
                    className="h-full w-full object-cover"
                    onLoad={() => setThermalImageOk(true)}
                    onError={() => setThermalImageOk(false)}
                  />

                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                </div>
              </section>

              <section className="rounded-[26px] border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/20">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg md:text-xl font-semibold">
                      자율주행 모니터링
                    </h2>
                    <p className="text-sm text-slate-400">
                      작업 시야 및 환경 인식 확인
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-3 py-1 text-xs text-sky-300">
                    STREAMING
                  </span>
                </div>
                <div className="aspect-video w-full rounded-2xl border border-white/10 bg-[linear-gradient(135deg,_rgba(14,165,233,0.18),_rgba(15,23,42,0.88))] p-4 flex items-end overflow-hidden relative">
                  <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_25%_15%,rgba(96,165,250,0.24),transparent_35%),radial-gradient(circle_at_75%_75%,rgba(168,85,247,0.18),transparent_30%)]" />
                </div>
              </section>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
              <section className="rounded-[26px] border border-white/10 bg-slate-900/70 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold">
                      배터리 그래프
                    </h3>
                    <p className="text-sm text-slate-400">
                      실시간 전압 및 잔량 추이
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">현재 잔량</div>
                    <div className="text-2xl font-semibold text-emerald-300">
                      45%
                    </div>
                  </div>
                </div>
                <svg
                  viewBox="0 0 320 160"
                  className="h-52 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-2"
                >
                  <defs>
                    <linearGradient id="batteryLine" x1="0" x2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((i) => (
                    <line
                      key={i}
                      x1="16"
                      x2="304"
                      y1={16 + i * 32}
                      y2={16 + i * 32}
                      stroke="rgba(148,163,184,0.15)"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d={linePath(batteryData)}
                    fill="none"
                    stroke="url(#batteryLine)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </section>

              <section className="rounded-[26px] border border-white/10 bg-slate-900/70 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold">
                      온도 그래프
                    </h3>
                    <p className="text-sm text-slate-400">
                      내부 온도 및 상승 추세
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">최고 온도</div>
                    <div className="text-2xl font-semibold text-amber-300">
                      52°C
                    </div>
                  </div>
                </div>
                <svg
                  viewBox="0 0 320 160"
                  className="h-52 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-2"
                >
                  <defs>
                    <linearGradient id="tempLine" x1="0" x2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#fb7185" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((i) => (
                    <line
                      key={i}
                      x1="16"
                      x2="304"
                      y1={16 + i * 32}
                      y2={16 + i * 32}
                      stroke="rgba(148,163,184,0.15)"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d={linePath(tempData)}
                    fill="none"
                    stroke="url(#tempLine)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </section>

              <section className="rounded-[26px] border border-white/10 bg-slate-900/70 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold">
                      트리거 로그
                    </h3>
                    <p className="text-sm text-slate-400">
                      특정 이벤트 및 경고 이력
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    6 events
                  </span>
                </div>
                <div className="h-52 overflow-auto rounded-2xl border border-white/10 bg-slate-950/60 p-3 space-y-3">
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-medium ${levelStyle(
                            log.level
                          )}`}
                        >
                          {log.level}
                        </span>
                        <span className="text-xs text-slate-400">{log.time}</span>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">
                        {log.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </main>

          <aside className="border-t xl:border-t-0 xl:border-l border-white/10 bg-slate-950/50 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">시스템 연결 상태</h2>
                <p className="text-sm text-slate-400">모듈별 연결 여부</p>
              </div>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                5 Modules
              </span>
            </div>

            <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-300">ROS Bridge</div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    rosConnected
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                      : "bg-rose-500/15 text-rose-300 border border-rose-400/30"
                  }`}
                >
                  {rosConnected ? "connect" : "disconnect"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {connectionItems.map((item) => (
                <div
                  key={item.name}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium text-slate-100">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.detail}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyle(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
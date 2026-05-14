import { useEffect, useMemo, useState, useRef } from "react";
import * as ROSLIB from "roslib";
import autonomyIcon from "./assets/icons/icon-autonomy.svg";
import thermalIcon from "./assets/icons/icon-thermal.svg";
import cameraIcon from "./assets/icons/icon-camera.svg";
import batteryIcon from "./assets/icons/icon-battery.svg";
import motorIcon from "./assets/icons/icon-motor.svg";
import temperatureIcon from "./assets/icons/icon-temperature.svg";
import rosIcon from "./assets/icons/icon-ros.svg";

const PAGE_IS_HTTPS = window.location.protocol === "https:";
const WS_PROTOCOL = PAGE_IS_HTTPS ? "wss" : "ws";
const HTTP_PROTOCOL = PAGE_IS_HTTPS ? "https" : "http";
const DEFAULT_HOST = window.location.hostname;

const ROS_HOST = import.meta.env.VITE_ROS_HOST || DEFAULT_HOST;
const ROSBRIDGE_PORT = import.meta.env.VITE_ROSBRIDGE_PORT || "9090";
const VIDEO_HOST = import.meta.env.VITE_VIDEO_HOST || DEFAULT_HOST;
const VIDEO_PORT = import.meta.env.VITE_VIDEO_PORT || "8080";

const ROSBRIDGE_URL = `${WS_PROTOCOL}://${ROS_HOST}:${ROSBRIDGE_PORT}`;
const TIMEOUT_MS = 4000;
const CHECK_INTERVAL_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 10; // 최대 재연결 시도 횟수
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const SAMPLE_INTERVAL_OPTIONS = [500, 1000, 2000];
const TREND_WINDOW_OPTIONS = [16, 32, 64, 120];
const DEFAULT_TREND_WINDOW = 32;
const MAX_HISTORY_POINTS = 240;
const INITIAL_HISTORY_POINTS = 64;

const BATTERY_MIN_V = 0;
const BATTERY_MAX_V = 15;
const BATTERY_BASE_V = 11.1;
const BATTERY_INITIAL_VARIANCE = 0.3;

const TEMP_MIN_C = 0;
const TEMP_MAX_C = 100;
const TEMP_BASE_C = 30;
const TEMP_INITIAL_VARIANCE = 5;

const GRAPH_FRAME = {
  width: 320,
  height: 160,
  padLeft: 36,
  padRight: 14,
  padTop: 12,
  padBottom: 22,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatTimeLabel = (timeMs) => {
  const date = new Date(timeMs);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const createInitialSeries = (count, baseValue, variance, min, max, intervalMs) => {
  const now = Date.now();
  return Array.from({ length: count }, (_, idx) => {
    const timestamp = now - (count - 1 - idx) * intervalMs;
    const randomOffset = (Math.random() * 2 - 1) * variance;
    return {
      t: timestamp,
      label: formatTimeLabel(timestamp),
      value: clamp(baseValue + randomOffset, min, max),
    };
  });
};

const TOPIC_CONFIG = [
  { key: "autonomy", name: "자율주행", topic: "/autonomy/status" },
  { key: "thermal_camera", name: "열화상", topic: "/thermal_camera/status" },
  { key: "thermal_max_temp", name: "열화상 최대 온도", topic: "/thermal/max_temperature" },
  { key: "vision_sensor", name: "RGB 카메라", topic: "/vision_sensor/status" },
  { key: "battery_sensor", name: "배터리 상태", topic: "/battery_sensor/status" },
  { key: "motor", name: "모터 상태", topic: "/motor/status" },
  { key: "temperature_sensor", name: "로봇 온도", topic: "/temperature_sensor/status" },
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
  const [activeTab, setActiveTab] = useState("home");
  const [thermalReloadKey, setThermalReloadKey] = useState(0);
  const [thermalImageOk, setThermalImageOk] = useState(false);
  const [rgbReloadKey, setRgbReloadKey] = useState(0);
  const [rgbImageOk, setRgbImageOk] = useState(false);
  const [rvizReloadKey, setRvizReloadKey] = useState(0);
  const [rvizImageOk, setRvizImageOk] = useState(false);
  const [topicStates, setTopicStates] = useState(createInitialTopicState());
  const [thermalImageSize, setThermalImageSize] = useState({ width: 0, height: 0 });
  const [maxTemperature, setMaxTemperature] = useState(null);

  // 재연결 로직용 ref
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const rosInstanceRef = useRef(null);
  const [sampleIntervalMs, setSampleIntervalMs] = useState(DEFAULT_SAMPLE_INTERVAL_MS);
  const [trendWindowPoints, setTrendWindowPoints] = useState(DEFAULT_TREND_WINDOW);
  const [batterySeries, setBatterySeries] = useState(() =>
    createInitialSeries(
      INITIAL_HISTORY_POINTS,
      BATTERY_BASE_V,
      BATTERY_INITIAL_VARIANCE,
      BATTERY_MIN_V,
      BATTERY_MAX_V,
      DEFAULT_SAMPLE_INTERVAL_MS
    )
  );
  const [tempSeries, setTempSeries] = useState(() =>
    createInitialSeries(
      INITIAL_HISTORY_POINTS,
      TEMP_BASE_C,
      TEMP_INITIAL_VARIANCE,
      TEMP_MIN_C,
      TEMP_MAX_C,
      DEFAULT_SAMPLE_INTERVAL_MS
    )
  );

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
    `${HTTP_PROTOCOL}://${VIDEO_HOST}:${VIDEO_PORT}/stream?topic=/thermal/image&qos_profile=sensor_data`;
  const rgbStreamUrl =
    `${HTTP_PROTOCOL}://${VIDEO_HOST}:${VIDEO_PORT}/stream?topic=/rgb/image_raw&qos_profile=sensor_data`;
  const rvizStreamUrl =
    `${HTTP_PROTOCOL}://${VIDEO_HOST}:${VIDEO_PORT}/stream?topic=/rviz/image&qos_profile=sensor_data`;

  useEffect(() => {
    let isUnmounted = false;
    let subscribers = [];
    let timeoutChecker = null;

    const scheduleReconnect = () => {
      if (
        isUnmounted ||
        reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS
      ) {
        console.error(
          `[ROS] Max reconnection attempts reached (${MAX_RECONNECT_ATTEMPTS})`
        );
        return;
      }

      reconnectAttemptRef.current += 1;
      // 지수 백오프: 1초, 2초, 4초, 8초, ... 최대 30초
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttemptRef.current - 1),
        30000
      );

      console.log(
        `[ROS] Scheduling reconnection in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`
      );

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        connectRos();
      }, delay);
    };

    const connectRos = () => {
      if (isUnmounted) return;

      // 기존 연결 정리
      if (rosInstanceRef.current) {
        try {
          rosInstanceRef.current.close();
        } catch (e) {
          console.warn("[ROS] Failed to close existing connection:", e);
        }
      }

      // 기존 구독자 정리
      subscribers.forEach((topic) => {
        try {
          topic.unsubscribe();
        } catch (e) {
          console.warn("[ROS] unsubscribe failed:", e);
        }
      });
      subscribers = [];

      const ros = new ROSLIB.Ros({
        url: ROSBRIDGE_URL,
      });

      rosInstanceRef.current = ros;

      ros.on("connection", () => {
        if (isUnmounted) return;
        reconnectAttemptRef.current = 0; // 성공 시 재시도 카운트 리셋
        setRosConnected(true);
        console.log("[ROS] rosbridge connected successfully");
      });

      ros.on("error", (error) => {
        if (isUnmounted) return;
        setRosConnected(false);
        console.error("[ROS] rosbridge error:", error);
        scheduleReconnect();
      });

      ros.on("close", () => {
        if (isUnmounted) return;
        setRosConnected(false);
        console.warn("[ROS] rosbridge connection closed");

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

        scheduleReconnect();
      });

      TOPIC_CONFIG.forEach((cfg) => {
        // thermal_max_temp는 Float32 메시지 사용
        if (cfg.key === 'thermal_max_temp') {
          const topic = new ROSLIB.Topic({
            ros,
            name: cfg.topic,
            messageType: "std_msgs/msg/Float32",
          });

          topic.subscribe((message) => {
            if (isUnmounted) return;
            setMaxTemperature(message.data);
            // 최대 온도 토픽도 상태 업데이트
            setTopicStates((prev) => ({
              ...prev,
              [cfg.key]: {
                value: message.data,
                lastSeen: Date.now(),
                timedOut: false,
              },
            }));
          });

          subscribers.push(topic);
        } else {
          // 다른 토픽들은 Bool 메시지 사용
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
        }
      });

      timeoutChecker = setInterval(() => {
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
    };

    // 초기 연결
    connectRos();

    return () => {
      isUnmounted = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (timeoutChecker) {
        clearInterval(timeoutChecker);
      }

      subscribers.forEach((topic) => {
        try {
          topic.unsubscribe();
        } catch (e) {
          console.warn("[ROS] unsubscribe failed:", e);
        }
      });

      if (rosInstanceRef.current) {
        try {
          rosInstanceRef.current.close();
        } catch (e) {
          console.warn("[ROS] close failed:", e);
        }
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      setBatterySeries((prev) => {
        const lastValue = prev[prev.length - 1]?.value ?? BATTERY_BASE_V;
        const jitter = (Math.random() * 2 - 1) * 0.06;
        const restore = (BATTERY_BASE_V - lastValue) * 0.12;
        const nextValue = clamp(lastValue + jitter + restore, BATTERY_MIN_V, BATTERY_MAX_V);

        const next = {
          t: now,
          label: formatTimeLabel(now),
          value: Number(nextValue.toFixed(2)),
        };

        return [...prev.slice(-(MAX_HISTORY_POINTS - 1)), next];
      });

      setTempSeries((prev) => {
        const lastValue = prev[prev.length - 1]?.value ?? TEMP_BASE_C;
        const jitter = (Math.random() * 2 - 1) * 1.0;
        const restore = (TEMP_BASE_C - lastValue) * 0.08;
        const nextValue = clamp(lastValue + jitter + restore, TEMP_MIN_C, TEMP_MAX_C);

        const next = {
          t: now,
          label: formatTimeLabel(now),
          value: Number(nextValue.toFixed(1)),
        };

        return [...prev.slice(-(MAX_HISTORY_POINTS - 1)), next];
      });
    }, sampleIntervalMs);

    return () => clearInterval(timer);
  }, [sampleIntervalMs]);

  const iconMap = {
    autonomy: autonomyIcon,
    thermal_camera: thermalIcon,
    vision_sensor: cameraIcon,
    battery_sensor: batteryIcon,
    motor: motorIcon,
    temperature_sensor: temperatureIcon,
  };

  const connectionItems = useMemo(() => {
    return TOPIC_CONFIG.filter(cfg => cfg.key !== 'thermal_max_temp').map((cfg) => {
      const state = topicStates[cfg.key];
      const isAlive = state && !state.timedOut && state.value === true;

      return {
        name: cfg.name,
        status: isAlive ? "connect" : "disconnect",
        icon: iconMap[cfg.key] || cameraIcon,
      };
    });
  }, [topicStates]);

  const thermalTopicAlive = useMemo(() => {
    const state = topicStates.thermal_camera;
    return state && !state.timedOut && state.value === true;
  }, [topicStates]);

  const batteryViewSeries = useMemo(
    () => batterySeries.slice(-trendWindowPoints),
    [batterySeries, trendWindowPoints]
  );
  const tempViewSeries = useMemo(
    () => tempSeries.slice(-trendWindowPoints),
    [tempSeries, trendWindowPoints]
  );


  const graphX = (index, length, frame = GRAPH_FRAME) => {
    const { width, padLeft, padRight } = frame;
    const span = width - padLeft - padRight;
    if (length <= 1) return padLeft;
    return padLeft + (index * span) / (length - 1);
  };

  const graphY = (value, min, max, frame = GRAPH_FRAME) => {
    const { height, padTop, padBottom } = frame;
    const range = max - min || 1;
    const normalized = (value - min) / range;
    const drawableHeight = height - padTop - padBottom;
    return padTop + (1 - normalized) * drawableHeight;
  };

  const linePath = (series, min, max, frame = GRAPH_FRAME) => {
    return series
      .map((point, i) => {
        const x = graphX(i, series.length, frame);
        const y = graphY(point.value, min, max, frame);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  };

  const axisLabelIndexes = (length) => {
    if (length < 2) return [0];
    const raw = [0, Math.floor((length - 1) / 3), Math.floor((2 * (length - 1)) / 3), length - 1];
    return [...new Set(raw)];
  };

  const zoomInTrend = () => {
    setTrendWindowPoints((prev) => {
      const idx = TREND_WINDOW_OPTIONS.findIndex((value) => value === prev);
      if (idx <= 0) return TREND_WINDOW_OPTIONS[0];
      return TREND_WINDOW_OPTIONS[idx - 1];
    });
  };

  const zoomOutTrend = () => {
    setTrendWindowPoints((prev) => {
      const idx = TREND_WINDOW_OPTIONS.findIndex((value) => value === prev);
      if (idx === -1 || idx >= TREND_WINDOW_OPTIONS.length - 1) {
        return TREND_WINDOW_OPTIONS[TREND_WINDOW_OPTIONS.length - 1];
      }
      return TREND_WINDOW_OPTIONS[idx + 1];
    });
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

  const miniStatClass =
    "rounded-2xl border border-white/15 bg-white/[0.05] backdrop-blur-lg backdrop-saturate-150 px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]";

  const glassPanelClass =
    "rounded-[26px] border border-white/15 bg-white/[0.06] backdrop-blur-xl backdrop-saturate-150 shadow-[0_10px_35px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]";

  const glassInsetClass =
    "rounded-2xl border border-white/15 bg-white/[0.05] backdrop-blur-lg backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]";

  const tabStyle = (tabKey) =>
    activeTab === tabKey
      ? "bg-cyan-500/20 border-cyan-300/50 text-cyan-100"
      : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#1d4b4b,_#0b1220_35%,_#09111b_70%)] p-4 md:p-6 text-white">
      <div className="mx-auto w-full max-w-none 2xl:max-w-[2200px] rounded-[30px] border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl overflow-hidden">
        <div className="border-b border-white/10 bg-white/[0.04] backdrop-blur-xl p-3 md:p-4">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <div className="h-11 w-11 rounded-2xl bg-cyan-500/20 border border-cyan-400/20 flex items-center justify-center text-cyan-300 font-semibold text-base">
              FR
            </div>
            <button
              onClick={() => setActiveTab("home")}
              className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${tabStyle("home")}`}
            >
              Home
            </button>
            <button
              onClick={() => setActiveTab("events")}
              className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${tabStyle("events")}`}
            >
              이벤트 로그
            </button>
            <button
              onClick={() => setActiveTab("overview")}
              className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${tabStyle("overview")}`}
            >
              시스템 개요
            </button>
          </div>
        </div>
 
        <div className="grid min-h-[90vh] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 p-4 md:p-6 lg:p-7">
            {activeTab === "home" && (
              <>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3 items-stretch">
              <section className={`flex flex-col ${glassPanelClass} p-4`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 flex-nowrap whitespace-nowrap">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/15 text-orange-300 text-xs">
                        <img src={thermalIcon} alt="열화상 아이콘" className="h-4 w-4" />
                      </span>
                      <h2 className="text-lg md:text-xl font-semibold whitespace-nowrap">
                        열화상 카메라
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
                      15 FPS
                    </span>
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

                <div className={`relative mt-1 aspect-square w-full overflow-hidden bg-black/40 ${glassInsetClass}`}>
                  <img
                    key={thermalReloadKey}
                    src={`${thermalStreamUrl}&reload=${thermalReloadKey}`}
                    alt="ROS2 thermal stream"
                    className="h-full w-full object-contain"
                    onLoad={(e) => {
                      const img = e.target;
                      setThermalImageSize({
                        width: img.naturalWidth,
                        height: img.naturalHeight
                      });
                      setThermalImageOk(true);
                    }}
                    onError={() => {
                      setThermalImageSize({ width: 0, height: 0 });
                      setThermalImageOk(false);
                    }}
                  />

                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                  <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] text-slate-100 backdrop-blur-sm">
                    0.0  2.0  4.0  6.0
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] text-orange-300 backdrop-blur-sm">
                    364°C
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className={miniStatClass}>
                    <div className="text-[11px] text-slate-400">최고 온도</div>
                    <div className="mt-1 text-lg font-semibold text-rose-300">
                      {maxTemperature !== null ? `${maxTemperature.toFixed(1)}°C` : "34.4°C"}
                    </div>
                  </div>
                  <div className={miniStatClass}>
                    <div className="text-[11px] text-slate-400">평균 온도</div>
                    <div className="mt-1 text-lg font-semibold text-amber-300">30.0°C</div>
                  </div>
                  <div className={miniStatClass}>
                    <div className="text-[11px] text-slate-400">최저 온도</div>
                    <div className="mt-1 text-lg font-semibold text-sky-300">24.4°C</div>
                  </div>
                </div>
              </section>

              <section className={`flex flex-col ${glassPanelClass} p-4`}>
                <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 flex-nowrap whitespace-nowrap">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 text-xs">
                        <img src={autonomyIcon} alt="자율주행 아이콘" className="h-4 w-4" />
                      </span>
                      <h2 className="text-lg md:text-xl font-semibold whitespace-nowrap">
                        자율주행 모니터링
                      </h2>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${
                        rvizImageOk
                          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                          : "border-rose-400/30 bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {rvizImageOk ? "RViz LIVE" : "RViz DISCONNECTED"}
                    </span>
                    <button
                      onClick={() => {
                        setRvizImageOk(false);
                        setRvizReloadKey((v) => v + 1);
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                    >
                      재연결
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className={`relative aspect-square w-full overflow-hidden ${glassInsetClass}`}>
                    <img
                      key={rvizReloadKey}
                      src={`${rvizStreamUrl}&reload=${rvizReloadKey}`}
                      alt="RViz live stream"
                      className="h-full w-full object-cover"
                      onLoad={() => {
                        setRvizImageOk(true);
                      }}
                      onError={() => {
                        setRvizImageOk(false);
                      }}
                    />

                    <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                    <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] text-slate-100 backdrop-blur-sm">
                      CAM FRONT
                    </div>
                    <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] text-rose-300 backdrop-blur-sm">
                      REC
                    </div>
                  </div>
                </div>
              </section>

              <section className={`flex flex-col ${glassPanelClass} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 flex-nowrap whitespace-nowrap">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 text-xs">
                        <img src={cameraIcon} alt="카메라 아이콘" className="h-4 w-4" />
                      </span>
                      <h2 className="text-lg md:text-xl font-semibold whitespace-nowrap">
                        RGB 카메라
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300">
                      정상 - 30 FPS
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        rgbImageOk
                          ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                          : "border border-rose-400/30 bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {rgbImageOk ? "LIVE" : "DISCONNECTED"}
                    </span>

                    <button
                      onClick={() => {
                        setRgbImageOk(false);
                        setRgbReloadKey((v) => v + 1);
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                    >
                      재연결
                    </button>
                  </div>
                </div>

                <div className={`relative aspect-square w-full overflow-hidden ${glassInsetClass}`}>
                  <img
                    key={rgbReloadKey}
                    src={`${rgbStreamUrl}&reload=${rgbReloadKey}`}
                    alt="RGB camera stream"
                    className="h-full w-full object-cover"
                    onLoad={() => {
                      setRgbImageOk(true);
                    }}
                    onError={() => {
                      setRgbImageOk(false);
                    }}
                  />

                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                  <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] text-slate-100 backdrop-blur-sm">
                    CAM FRONT · 5:45:02
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] text-rose-300 backdrop-blur-sm">
                    REC
                  </div>
                </div>
              </section>
                </div>

                <div className="mt-5 mb-3 flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200">
                    샘플링 주기
                  </div>
                  <select
                    value={sampleIntervalMs}
                    onChange={(e) => setSampleIntervalMs(Number(e.target.value))}
                    className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-slate-100"
                  >
                    {SAMPLE_INTERVAL_OPTIONS.map((ms) => (
                      <option key={ms} value={ms}>
                        {ms} ms
                      </option>
                    ))}
                  </select>

                  <div className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200">
                    추이 범위 {trendWindowPoints}포인트
                  </div>
                  <button
                    onClick={zoomInTrend}
                    className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-slate-100 hover:bg-white/[0.1]"
                  >
                    축 확대
                  </button>
                  <button
                    onClick={zoomOutTrend}
                    className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-slate-100 hover:bg-white/[0.1]"
                  >
                    축 축소
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
                  <section className={`${glassPanelClass} p-4 md:p-5`}>
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
                        <div className="text-sm text-slate-400">현재 전압</div>
                        <div className="text-2xl font-semibold text-emerald-300">
                          {batterySeries[batterySeries.length - 1]?.value.toFixed(2)}V
                        </div>
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 320 160"
                      className={`h-52 w-full ${glassInsetClass} p-2`}
                    >
                      <defs>
                        <linearGradient id="batteryLine" x1="0" x2="1">
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#60a5fa" />
                        </linearGradient>
                      </defs>
                      {[0, 5, 10, 15].map((tick) => {
                        const y = graphY(tick, BATTERY_MIN_V, BATTERY_MAX_V);
                        return (
                          <g key={tick}>
                            <line
                              x1={GRAPH_FRAME.padLeft}
                              x2={GRAPH_FRAME.width - GRAPH_FRAME.padRight}
                              y1={y}
                              y2={y}
                              stroke="rgba(148,163,184,0.18)"
                              strokeWidth="1"
                            />
                            <text x="4" y={y + 3} fontSize="9" fill="rgba(203,213,225,0.8)">{tick}V</text>
                          </g>
                        );
                      })}
                      {axisLabelIndexes(batteryViewSeries.length).map((idx) => {
                        const x = graphX(idx, batteryViewSeries.length);
                        const label = batteryViewSeries[idx]?.label?.slice(3) ?? "";
                        return (
                          <text key={`battery-x-${idx}`} x={x} y="154" textAnchor="middle" fontSize="9" fill="rgba(148,163,184,0.8)">
                            {label}
                          </text>
                        );
                      })}
                      <path
                        d={linePath(batteryViewSeries, BATTERY_MIN_V, BATTERY_MAX_V)}
                        fill="none"
                        stroke="url(#batteryLine)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </section>

                  <section className={`${glassPanelClass} p-4 md:p-5`}>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-base md:text-lg font-semibold">
                          로봇의 내부 온도 추이
                        </h3>
                        <p className="text-sm text-slate-400">
                          내부 온도 및 상승 추세
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-400">현재 온도</div>
                        <div className="text-2xl font-semibold text-amber-300">
                          {tempSeries[tempSeries.length - 1]?.value.toFixed(1)}°C
                        </div>
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 320 160"
                      className={`h-52 w-full ${glassInsetClass} p-2`}
                    >
                      <defs>
                        <linearGradient id="tempLine" x1="0" x2="1">
                          <stop offset="0%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#fb7185" />
                        </linearGradient>
                      </defs>
                      {[0, 20, 40, 60, 80, 100].map((tick) => {
                        const y = graphY(tick, TEMP_MIN_C, TEMP_MAX_C);
                        return (
                          <g key={tick}>
                            <line
                              x1={GRAPH_FRAME.padLeft}
                              x2={GRAPH_FRAME.width - GRAPH_FRAME.padRight}
                              y1={y}
                              y2={y}
                              stroke="rgba(148,163,184,0.18)"
                              strokeWidth="1"
                            />
                            <text x="4" y={y + 3} fontSize="9" fill="rgba(203,213,225,0.8)">{tick}°</text>
                          </g>
                        );
                      })}
                      {axisLabelIndexes(tempViewSeries.length).map((idx) => {
                        const x = graphX(idx, tempViewSeries.length);
                        const label = tempViewSeries[idx]?.label?.slice(3) ?? "";
                        return (
                          <text key={`temp-x-${idx}`} x={x} y="154" textAnchor="middle" fontSize="9" fill="rgba(148,163,184,0.8)">
                            {label}
                          </text>
                        );
                      })}
                      <path
                        d={linePath(tempViewSeries, TEMP_MIN_C, TEMP_MAX_C)}
                        fill="none"
                        stroke="url(#tempLine)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </section>

                  <section className={`${glassPanelClass} p-4 md:p-5`}>
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
                        {logs.length} events
                      </span>
                    </div>
                    <div className={`h-52 overflow-auto ${glassInsetClass} p-3 space-y-3`}>
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
              </>
            )}

            {activeTab === "events" && (
              <section className={`${glassPanelClass} p-4 md:p-5`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base md:text-lg font-semibold">이벤트 로그</h3>
                    <p className="text-sm text-slate-400">전체 이벤트 및 경고 이력</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`${glassInsetClass} p-4`}
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
                      <p className="text-sm text-slate-200 leading-relaxed">{log.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "overview" && (
              <section className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className={`${glassInsetClass} p-4`}>
                    <div className="text-sm text-slate-400">총 모듈 수</div>
                    <div className="mt-2 text-2xl font-semibold text-cyan-200">6</div>
                  </div>
                  <div className={`${glassInsetClass} p-4`}>
                    <div className="text-sm text-slate-400">연결 상태</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">
                      {connectionItems.filter((item) => item.status === "connect").length}
                    </div>
                    <div className="text-xs text-slate-400">connect modules</div>
                  </div>
                  <div className={`${glassInsetClass} p-4`}>
                    <div className="text-sm text-slate-400">비연결 상태</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-300">
                      {connectionItems.filter((item) => item.status === "disconnect").length}
                    </div>
                    <div className="text-xs text-slate-400">disconnect modules</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className={`${glassInsetClass} p-4`}>
                    <div className="text-sm text-slate-400">ROS Bridge</div>
                    <div className="mt-2">
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

                  {connectionItems.map((item) => (
                    <div
                      key={`${item.name}-overview`}
                      className={`${glassInsetClass} p-4 flex items-center justify-between gap-3`}
                    >
                      <div className="flex items-center gap-2">
                        <img src={item.icon} alt={`${item.name} 아이콘`} className="h-5 w-5" />
                        <span className="text-sm text-slate-200">{item.name}</span>
                      </div>
                      <div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyle(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className="border-t xl:border-t-0 xl:border-l border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">시스템 연결 상태</h2>
              </div>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                6 Modules
              </span>
            </div>

            <div className={`mb-3 ${glassInsetClass} p-4 flex items-center justify-between gap-3`}>
              <div className="flex items-center gap-3">
                <img src={rosIcon} alt="ROS 아이콘" className="h-6 w-6" />
                <div className="text-sm text-slate-300">ROS Bridge</div>
              </div>
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

            <div className="space-y-3">
              {connectionItems.map((item) => (
                <div
                  key={item.name}
                  className={`${glassInsetClass} p-4 flex items-center justify-between gap-3`}
                >
                  <div className="flex items-center gap-3">
                    <img src={item.icon} alt={`${item.name} 아이콘`} className="h-6 w-6" />
                    <div className="font-medium text-slate-100">{item.name}</div>
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
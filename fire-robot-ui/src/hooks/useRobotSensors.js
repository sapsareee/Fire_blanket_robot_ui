import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ROSLIB from "roslib";

const TIMEOUT_MS = 4000;
const CHECK_INTERVAL_MS = 1000;
const MAX_HISTORY_POINTS = 240;
const FIRE_RISK_TEMP_THRESHOLD_C = 80;
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_TREND_WINDOW = 32;

export const SAMPLE_INTERVAL_OPTIONS = [500, 1000, 2000];
export const TREND_WINDOW_OPTIONS = [16, 32, 64, 120];

export const TOPIC_CONFIG = [
  { key: "autonomy", name: "자율주행", topic: "/autonomy/status" },
  { key: "thermal_camera", name: "열화상", topic: "/thermal_camera/status" },
  {
    key: "thermal_avg_temp",
    name: "열화상 온도 추세",
    topic: "/thermal/temperature_trend",
    numeric: true,
  },
  {
    key: "thermal_max_temp",
    name: "열화상 최고 온도",
    topic: "/thermal/max_temperature",
    numeric: true,
  },
  { key: "vision_sensor", name: "RGB 카메라", topic: "/vision_sensor/status" },
  { key: "motor", name: "모터 상태", topic: "/motor/status" },
];

const createInitialTopicState = () =>
  TOPIC_CONFIG.reduce((acc, config) => {
    acc[config.key] = {
      value: config.numeric ? null : false,
      lastSeen: 0,
      timedOut: true,
      source: null,
    };
    return acc;
  }, {});

const emptySensorData = () => ({ value: null, lastSeen: 0, source: null });

const formatTimeLabel = (timeMs) => {
  const date = new Date(timeMs);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const appendHistoryPoint = (previous, point) =>
  previous.length >= MAX_HISTORY_POINTS
    ? [...previous.slice(1), point]
    : [...previous, point];

const isAlive = (state, ros) =>
  Boolean(
    state &&
      state.source === ros &&
      !state.timedOut &&
      state.value === true
  );

const hasFreshValue = (data, ros, now) =>
  Boolean(
    data &&
      data.source === ros &&
      data.value !== null &&
      data.lastSeen > 0 &&
      now - data.lastSeen <= TIMEOUT_MS
  );

export function useRobotSensors({ ros, rosConnected, onEvent }) {
  const [topicStates, setTopicStates] = useState(createInitialTopicState);
  const [temperatureTrendData, setTemperatureTrendData] = useState(emptySensorData);
  const [maxTemperatureData, setMaxTemperatureData] = useState(emptySensorData);
  const [fireData, setFireData] = useState(emptySensorData);
  const [batteryData, setBatteryData] = useState(emptySensorData);
  const [internalTemperatureData, setInternalTemperatureData] =
    useState(emptySensorData);
  const [batterySeries, setBatterySeries] = useState([]);
  const [tempSeries, setTempSeries] = useState([]);
  const [sampleIntervalMs, setSampleIntervalMs] = useState(
    DEFAULT_SAMPLE_INTERVAL_MS
  );
  const [trendWindowPoints, setTrendWindowPoints] = useState(
    DEFAULT_TREND_WINDOW
  );

  const topicStatesRef = useRef(topicStates);
  const temperatureTrendRef = useRef(temperatureTrendData);
  const maxTemperatureRef = useRef(maxTemperatureData);
  const fireDataRef = useRef(fireData);
  const batteryDataRef = useRef(batteryData);
  const internalTemperatureRef = useRef(internalTemperatureData);
  const fireStateRef = useRef(null);
  const highTemperatureRef = useRef(null);

  const updateTopicState = useCallback((key, nextState) => {
    const nextTopicStates = {
      ...topicStatesRef.current,
      [key]: nextState,
    };
    topicStatesRef.current = nextTopicStates;
    setTopicStates(nextTopicStates);
  }, []);

  useEffect(() => {
    if (!ros) return undefined;

    let active = true;
    const subscribers = [];
    fireStateRef.current = null;
    highTemperatureRef.current = null;

    TOPIC_CONFIG.forEach((config) => {
      const topic = new ROSLIB.Topic({
        ros,
        name: config.topic,
        messageType: config.numeric
          ? "std_msgs/msg/Float32"
          : "std_msgs/msg/Bool",
      });

      topic.subscribe((message) => {
        if (!active) return;

        const now = Date.now();
        const previous = topicStatesRef.current[config.key];

        if (config.numeric) {
          const numericValue = Number(message.data);
          if (!Number.isFinite(numericValue)) return;

          const nextState = {
            value: numericValue,
            lastSeen: now,
            timedOut: false,
            source: ros,
          };
          updateTopicState(config.key, nextState);

          const nextData = { value: numericValue, lastSeen: now, source: ros };
          if (config.key === "thermal_avg_temp") {
            temperatureTrendRef.current = nextData;
            setTemperatureTrendData(nextData);
          } else {
            const isHigh = numericValue >= FIRE_RISK_TEMP_THRESHOLD_C;
            if (isHigh && highTemperatureRef.current !== true) {
              onEvent(
                "WARN",
                `고온 경고: 최고 온도 ${numericValue.toFixed(1)}°C (임계치 ${FIRE_RISK_TEMP_THRESHOLD_C}°C)`
              );
            } else if (!isHigh && highTemperatureRef.current === true) {
              onEvent(
                "INFO",
                `고온 상태 해제: 최고 온도 ${numericValue.toFixed(1)}°C`
              );
            }
            highTemperatureRef.current = isHigh;
            maxTemperatureRef.current = nextData;
            setMaxTemperatureData(nextData);
          }
          return;
        }

        const nextValue = Boolean(message.data);
        const wasAlive = isAlive(previous, ros);
        const nextState = {
          value: nextValue,
          lastSeen: now,
          timedOut: false,
          source: ros,
        };
        updateTopicState(config.key, nextState);

        if (!wasAlive && nextValue) {
          onEvent("INFO", `${config.name} 모듈 연결됨`);
        } else if (wasAlive && !nextValue) {
          onEvent("WARN", `${config.name} 모듈 연결 끊김`);
        }
      });

      subscribers.push(topic);
    });

    const batteryTopic = new ROSLIB.Topic({
      ros,
      name: "/battery_voltage",
      messageType: "std_msgs/msg/Float32",
    });
    batteryTopic.subscribe((message) => {
      if (!active) return;
      const value = Number(message.data);
      if (!Number.isFinite(value)) return;

      const now = Date.now();
      const wasConnected = hasFreshValue(batteryDataRef.current, ros, now);
      const roundedValue = Number(value.toFixed(2));
      const nextData = { value: roundedValue, lastSeen: now, source: ros };
      batteryDataRef.current = nextData;
      setBatteryData(nextData);
      if (!wasConnected) {
        onEvent("INFO", "배터리 센서 데이터 수신 시작");
      }
      setBatterySeries((previous) =>
        appendHistoryPoint(previous, {
          t: now,
          label: formatTimeLabel(now),
          value: roundedValue,
        })
      );
    });
    subscribers.push(batteryTopic);

    const fireTopic = new ROSLIB.Topic({
      ros,
      name: "/thermal/fire_detected",
      messageType: "std_msgs/msg/Bool",
    });
    fireTopic.subscribe((message) => {
      if (!active) return;

      const now = Date.now();
      const nextValue = Boolean(message.data);
      const previousValue = fireStateRef.current;
      if (nextValue && previousValue !== true) {
        onEvent("ALERT", "화재 발생 가능성 감지됨");
      } else if (!nextValue && previousValue === true) {
        onEvent("INFO", "화재 감지 상태 해제됨");
      }

      fireStateRef.current = nextValue;
      const nextData = { value: nextValue, lastSeen: now, source: ros };
      fireDataRef.current = nextData;
      setFireData(nextData);
    });
    subscribers.push(fireTopic);

    const internalTemperatureTopic = new ROSLIB.Topic({
      ros,
      name: "/robot/internal_temperature",
      messageType: "std_msgs/msg/Float32",
    });
    internalTemperatureTopic.subscribe((message) => {
      if (!active) return;
      const value = Number(message.data);
      if (!Number.isFinite(value)) return;

      const now = Date.now();
      const wasConnected = hasFreshValue(
        internalTemperatureRef.current,
        ros,
        now
      );
      const roundedValue = Number(value.toFixed(1));
      const nextData = { value: roundedValue, lastSeen: now, source: ros };
      internalTemperatureRef.current = nextData;
      setInternalTemperatureData(nextData);
      if (!wasConnected) {
        onEvent("INFO", "로봇 온도센서 데이터 수신 시작");
      }
      setTempSeries((previous) =>
        appendHistoryPoint(previous, {
          t: now,
          label: formatTimeLabel(now),
          value: roundedValue,
        })
      );
    });
    subscribers.push(internalTemperatureTopic);

    return () => {
      active = false;
      subscribers.forEach((topic) => {
        try {
          topic.unsubscribe();
        } catch (error) {
          console.warn("[ROS] Topic unsubscribe failed:", error);
        }
      });
      fireStateRef.current = null;
      highTemperatureRef.current = null;
    };
  }, [onEvent, ros, updateTopicState]);

  useEffect(() => {
    if (!ros) return undefined;

    const timeoutChecker = setInterval(() => {
      const now = Date.now();
      const nextTopicStates = { ...topicStatesRef.current };
      let topicsChanged = false;

      TOPIC_CONFIG.forEach((config) => {
        const current = topicStatesRef.current[config.key];
        if (
          current.source !== ros ||
          current.timedOut ||
          !current.lastSeen ||
          now - current.lastSeen <= TIMEOUT_MS
        ) {
          return;
        }

        if (isAlive(current, ros) && !config.numeric) {
          onEvent("WARN", `${config.name} 모듈 연결 timeout`);
        }
        nextTopicStates[config.key] = { ...current, timedOut: true };
        topicsChanged = true;
      });

      if (topicsChanged) {
        topicStatesRef.current = nextTopicStates;
        setTopicStates(nextTopicStates);
      }

      if (
        batteryDataRef.current.source === ros &&
        batteryDataRef.current.lastSeen > 0 &&
        now - batteryDataRef.current.lastSeen > TIMEOUT_MS
      ) {
        onEvent("WARN", "배터리 센서 데이터 timeout");
        const nextData = { value: null, lastSeen: 0, source: ros };
        batteryDataRef.current = nextData;
        setBatteryData(nextData);
      }

      if (
        temperatureTrendRef.current.source === ros &&
        temperatureTrendRef.current.lastSeen > 0 &&
        now - temperatureTrendRef.current.lastSeen > TIMEOUT_MS
      ) {
        const nextData = { value: null, lastSeen: 0, source: ros };
        temperatureTrendRef.current = nextData;
        setTemperatureTrendData(nextData);
      }

      if (
        maxTemperatureRef.current.source === ros &&
        maxTemperatureRef.current.lastSeen > 0 &&
        now - maxTemperatureRef.current.lastSeen > TIMEOUT_MS
      ) {
        const nextData = { value: null, lastSeen: 0, source: ros };
        highTemperatureRef.current = null;
        maxTemperatureRef.current = nextData;
        setMaxTemperatureData(nextData);
      }

      if (
        fireDataRef.current.source === ros &&
        fireDataRef.current.lastSeen > 0 &&
        now - fireDataRef.current.lastSeen > TIMEOUT_MS
      ) {
        if (fireStateRef.current !== null) {
          onEvent("WARN", "화재 감지 데이터 timeout: 현재 상태 확인 불가");
        }
        const nextData = { value: null, lastSeen: 0, source: ros };
        fireStateRef.current = null;
        fireDataRef.current = nextData;
        setFireData(nextData);
      }

      if (
        internalTemperatureRef.current.source === ros &&
        internalTemperatureRef.current.lastSeen > 0 &&
        now - internalTemperatureRef.current.lastSeen > TIMEOUT_MS
      ) {
        onEvent("WARN", "로봇 온도센서 데이터 timeout");
        const nextData = { value: null, lastSeen: 0, source: ros };
        internalTemperatureRef.current = nextData;
        setInternalTemperatureData(nextData);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timeoutChecker);
  }, [onEvent, ros]);

  useEffect(() => {
    if (!ros) return undefined;

    const graphFlowTimer = setInterval(() => {
      const now = Date.now();
      const batteryElapsed = now - batteryDataRef.current.lastSeen;
      if (
        batteryDataRef.current.source === ros &&
        batteryDataRef.current.value !== null &&
        batteryDataRef.current.lastSeen > 0 &&
        batteryElapsed > sampleIntervalMs * 0.8 &&
        batteryElapsed <= TIMEOUT_MS
      ) {
        setBatterySeries((previous) =>
          appendHistoryPoint(previous, {
            t: now,
            label: formatTimeLabel(now),
            value: batteryDataRef.current.value,
          })
        );
      }

      const temperatureElapsed = now - internalTemperatureRef.current.lastSeen;
      if (
        internalTemperatureRef.current.source === ros &&
        internalTemperatureRef.current.value !== null &&
        internalTemperatureRef.current.lastSeen > 0 &&
        temperatureElapsed > sampleIntervalMs * 0.8 &&
        temperatureElapsed <= TIMEOUT_MS
      ) {
        setTempSeries((previous) =>
          appendHistoryPoint(previous, {
            t: now,
            label: formatTimeLabel(now),
            value: internalTemperatureRef.current.value,
          })
        );
      }
    }, sampleIntervalMs);

    return () => clearInterval(graphFlowTimer);
  }, [ros, sampleIntervalMs]);

  const effectiveTopicStates = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(topicStates).map(([key, state]) => [
          key,
          {
            ...state,
            timedOut:
              !rosConnected || state.source !== ros || state.timedOut,
          },
        ])
      ),
    [ros, rosConnected, topicStates]
  );

  const selectCurrentValue = useCallback(
    (data) =>
      rosConnected && data.source === ros && data.lastSeen > 0
        ? data.value
        : null,
    [ros, rosConnected]
  );

  const zoomInTrend = useCallback(() => {
    setTrendWindowPoints((previous) => {
      const index = TREND_WINDOW_OPTIONS.indexOf(previous);
      return TREND_WINDOW_OPTIONS[Math.max(0, index - 1)];
    });
  }, []);

  const zoomOutTrend = useCallback(() => {
    setTrendWindowPoints((previous) => {
      const index = TREND_WINDOW_OPTIONS.indexOf(previous);
      return TREND_WINDOW_OPTIONS[
        Math.min(TREND_WINDOW_OPTIONS.length - 1, Math.max(0, index + 1))
      ];
    });
  }, []);

  return {
    topicStates: effectiveTopicStates,
    temperatureTrend: selectCurrentValue(temperatureTrendData),
    maxTemperature: selectCurrentValue(maxTemperatureData),
    fireDetected: selectCurrentValue(fireData),
    batteryVoltage: selectCurrentValue(batteryData),
    internalTemperature: selectCurrentValue(internalTemperatureData),
    batterySeries,
    tempSeries,
    batteryViewSeries: batterySeries.slice(-trendWindowPoints),
    tempViewSeries: tempSeries.slice(-trendWindowPoints),
    sampleIntervalOptions: SAMPLE_INTERVAL_OPTIONS,
    sampleIntervalMs,
    setSampleIntervalMs,
    trendWindowPoints,
    zoomInTrend,
    zoomOutTrend,
  };
}

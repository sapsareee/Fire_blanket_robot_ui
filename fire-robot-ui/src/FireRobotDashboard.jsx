import ConnectionPanel from "./ConnectionPanel";
import DashboardLayout from "./DashboardLayout";
import EventLogPanel from "./EventLogPanel";
import SensorChart from "./SensorChart";
import StreamCard from "./StreamCard";
import { useFireRobotDashboard } from "./hooks/useFireRobotDashboard";

const formatValue = (value, digits = 1) =>
  value === null ? "--" : value.toFixed(digits);

export default function FireRobotDashboard() {
  const dashboard = useFireRobotDashboard();
  const { bridge, sensors, streams, connectionItems, eventLogs } = dashboard;

  const batteryTone =
    sensors.batteryPercentage === null
      ? "unknown"
      : sensors.batteryPercentage < 20
        ? "alert"
        : "normal";
  const temperatureTone =
    sensors.internalTemperature === null
      ? "unknown"
      : sensors.internalTemperature >= 45
        ? "alert"
        : sensors.internalTemperature >= 40
          ? "warm"
          : "normal";

  const trendControls = (
    <div className="flex items-center gap-1">
      <select
        value={sensors.sampleIntervalMs}
        onChange={(event) =>
          sensors.setSampleIntervalMs(Number(event.target.value))
        }
        aria-label="그래프 샘플링 주기"
        className="rounded border border-white/10 bg-[#111620] px-1.5 py-1 text-[8px] text-slate-300 outline-none focus:border-emerald-400/40"
      >
        {sensors.sampleIntervalOptions.map((interval) => (
          <option key={interval} value={interval}>
            {interval}ms
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={sensors.zoomInTrend}
        aria-label="그래프 확대"
        className="grid h-5 w-5 place-items-center rounded border border-white/10 bg-[#111620] text-[10px] text-slate-400 hover:text-emerald-300"
      >
        +
      </button>
      <button
        type="button"
        onClick={sensors.zoomOutTrend}
        aria-label="그래프 축소"
        className="grid h-5 w-5 place-items-center rounded border border-white/10 bg-[#111620] text-[10px] text-slate-400 hover:text-emerald-300"
      >
        −
      </button>
    </div>
  );

  return (
    <DashboardLayout
      activeTab={dashboard.activeTab}
      onTabChange={dashboard.setActiveTab}
      bridgeStatus={bridge.status}
      onReconnectBridge={bridge.reconnect}
    >
      {dashboard.activeTab === "home" && (
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-2.5">
          <section className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
            <StreamCard
              {...streams.thermal}
              metric={
                sensors.maxTemperature === null
                  ? "--°C"
                  : `${sensors.maxTemperature.toFixed(1)}°C`
              }
            />
            <StreamCard {...streams.autonomy} />
            <StreamCard {...streams.rgb} />
          </section>

          <section className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-[170px_minmax(0,1fr)_330px]">
            <SensorChart
              title="Battery"
              label="Battery Status"
              value={sensors.batteryPercentage}
              unit="%"
              secondaryValue={
                sensors.batteryVoltage === null
                  ? "NO DATA"
                  : `${sensors.batteryVoltage.toFixed(2)}V`
              }
              percentage={sensors.batteryPercentage}
              status={batteryTone === "unknown" ? "UNKNOWN" : batteryTone === "alert" ? "LOW" : "NORMAL"}
              tone={batteryTone}
              series={sensors.batteryViewSeries}
              min={sensors.batteryRange.min}
              max={sensors.batteryRange.max}
            />
            <SensorChart
              title="Temperature"
              label="System Temperature"
              value={
                sensors.internalTemperature === null
                  ? null
                  : formatValue(sensors.internalTemperature)
              }
              unit="°C"
              percentage={sensors.temperaturePercentage}
              status={
                temperatureTone === "unknown"
                  ? "UNKNOWN"
                  : temperatureTone === "alert"
                    ? "HOT"
                    : temperatureTone === "warm"
                      ? "WARM"
                      : "NORMAL"
              }
              tone={temperatureTone}
              series={sensors.tempViewSeries}
              min={sensors.temperatureRange.min}
              max={sensors.temperatureRange.max}
              wide
              controls={trendControls}
            />
            <ConnectionPanel
              rosConnected={bridge.connected}
              bridgeStatus={bridge.status}
              items={connectionItems}
              fireDetected={sensors.fireDetected}
            />
          </section>

          <EventLogPanel logs={eventLogs} />
        </div>
      )}

      {dashboard.activeTab === "events" && (
        <div className="mx-auto w-full max-w-[1680px]">
          <EventLogPanel logs={eventLogs} expanded />
        </div>
      )}

      {dashboard.activeTab === "overview" && (
        <div className="mx-auto grid w-full max-w-[1680px] gap-2.5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="grid gap-2.5 sm:grid-cols-2">
            <SensorChart
              title="Battery Overview"
              label="Battery Status"
              value={sensors.batteryPercentage}
              unit="%"
              secondaryValue={
                sensors.batteryVoltage === null
                  ? "NO DATA"
                  : `${sensors.batteryVoltage.toFixed(2)}V`
              }
              percentage={sensors.batteryPercentage}
              status={batteryTone === "unknown" ? "UNKNOWN" : batteryTone === "alert" ? "LOW" : "NORMAL"}
              tone={batteryTone}
              series={sensors.batteryViewSeries}
              min={sensors.batteryRange.min}
              max={sensors.batteryRange.max}
              wide
            />
            <SensorChart
              title="Temperature Overview"
              label="System Temperature"
              value={
                sensors.internalTemperature === null
                  ? null
                  : formatValue(sensors.internalTemperature)
              }
              unit="°C"
              secondaryValue={
                sensors.temperatureTrend === null
                  ? "NO TREND"
                  : `${sensors.temperatureTrend.toFixed(2)}°C/s`
              }
              percentage={sensors.temperaturePercentage}
              status={temperatureTone === "unknown" ? "UNKNOWN" : temperatureTone.toUpperCase()}
              tone={temperatureTone}
              series={sensors.tempViewSeries}
              min={sensors.temperatureRange.min}
              max={sensors.temperatureRange.max}
              wide
            />
          </section>
          <ConnectionPanel
            rosConnected={bridge.connected}
            bridgeStatus={bridge.status}
            items={connectionItems}
            fireDetected={sensors.fireDetected}
          />
        </div>
      )}
    </DashboardLayout>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
} from 'recharts';
import {
  Activity,
  Zap,
  ShieldCheck,
  Server,
  Terminal,
  Clock,
  Box,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlaCostVisualizer } from './SlaCostVisualizer';
import { RlVisualizationPanel } from './RlVisualizationPanel';

const SIMULATOR_URL =
  import.meta.env.VITE_SIMULATOR_URL ||
  (typeof window !== 'undefined' && window.location.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8083`
    : 'http://localhost:8083');

/* ============================================================
   Simulation Datasets
   ============================================================ */

const DATASETS = {
  organic: {
    label: 'Organic Traffic',
    description: 'Steady baseline — 50 to 100 RPS',
    data: [
      50, 52, 55, 58, 60, 62, 65, 63, 70, 72,
      68, 75, 78, 80, 76, 72, 70, 68, 65, 60,
      58, 55, 60, 62, 65, 70, 72, 75, 78, 80,
      82, 80, 78, 75, 72, 70, 68, 65, 62, 60,
    ],
  },

  flash_sale: {
    label: '⚡ Flash Sale Spike',
    description: 'Organic → 2,500 RPS spike → cooldown',
    data: [
      50, 55, 60, 65, 70, 80, 100, 200, 500, 1000,
      1800, 2200, 2500, 2500, 2400, 2000, 1500, 1000,
      600, 400, 250, 150, 100, 80, 65, 55, 50, 50,
      50, 50,
    ],
  },

  nasa_trace: {
    label: 'NASA HTTP Trace',
    description: 'Real 1995 NASA server traffic pattern',
    data: [
      120, 135, 140, 180, 210, 350, 620, 980, 1200, 1450,
      1600, 1580, 1420, 1300, 1200, 1100, 980, 850, 720,
      600, 480, 380, 280, 200, 160, 140, 130, 125, 120,
      118,
    ],
  },

  calgary_trace: {
    label: 'Calgary HTTP Trace',
    description: 'University server — sharp midday spike',
    data: [
      80, 85, 90, 95, 100, 120, 180, 320, 580, 850,
      1100, 1250, 1100, 900, 750, 600, 480, 380, 280,
      200, 160, 130, 110, 95, 88, 85, 82, 80, 80, 80,
    ],
  },
};

/* ============================================================
   Helpers
   ============================================================ */

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function getPredictionValue(data, snakeCaseKey, camelCaseKey) {
  const snake = data?.[snakeCaseKey];
  const camel = data?.[camelCaseKey];

  const value = Array.isArray(snake)
    ? snake[0]
    : Array.isArray(camel)
      ? camel[0]
      : snake ?? camel;

  return toNumber(value);
}

function fmt(value, digits = 0) {
  const number = toNumber(value);

  if (number === null) {
    return '—';
  }

  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

/* ============================================================
   Simulation Control Panel
   ============================================================ */

const SimulationControlPanel = ({
  latestStatus,
  selected,
  setSelected,
  onSimulationStarted,
}) => {
  const [localStatus, setLocalStatus] = useState(
    latestStatus || 'IDLE'
  );

  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (latestStatus) {
      setLocalStatus(latestStatus);
    }
  }, [latestStatus]);

  const startSimulation = async () => {
    if (starting || localStatus === 'SIMULATING') {
      return;
    }

    const dataset = DATASETS[selected];

    if (!dataset) {
      console.error('Unknown dataset:', selected);
      return;
    }

    setStarting(true);

    try {
      /*
       * Tell Dashboard to clear the old chart BEFORE
       * starting the new simulation.
       */
      if (onSimulationStarted) {
        onSimulationStarted(selected);
      }

      const response = await fetch(
        `${SIMULATOR_URL}/start-simulation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workload: dataset.data,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();

        throw new Error(
          text || `HTTP ${response.status}`
        );
      }

      let result = null;

      try {
        result = await response.json();
      } catch {
        // Endpoint may return empty response.
      }

      console.log(
        '[SimulationControlPanel] Simulation started:',
        result
      );

      setLocalStatus('SIMULATING');
    } catch (error) {
      console.error(
        '[SimulationControlPanel] Failed to start simulation:',
        error
      );

      /*
       * If the backend rejected the simulation,
       * allow the user to try again.
       */
      setLocalStatus('IDLE');
    } finally {
      setStarting(false);
    }
  };

  const dataset = DATASETS[selected];

  const statusColors = {
    IDLE: {
      bg: 'rgba(113,113,122,0.2)',
      text: '#71717A',
    },

    SIMULATING: {
      bg: 'rgba(34,197,94,0.2)',
      text: '#22c55e',
    },

    FINISHED: {
      bg: 'rgba(59,130,246,0.2)',
      text: '#3b82f6',
    },
  };

  const statusStyle =
    statusColors[localStatus] || statusColors.IDLE;

  const running =
    starting || localStatus === 'SIMULATING';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #252525',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#E7E6D9',
          marginBottom: 12,
        }}
      >
        Simulation Control
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <select
          value={selected}
          onChange={(event) =>
            setSelected(event.target.value)
          }
          disabled={running}
          style={{
            background: '#111111',
            color: '#E7E6D9',
            border: '1px solid #252525',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            cursor: running
              ? 'not-allowed'
              : 'pointer',
            opacity: running ? 0.6 : 1,
          }}
        >
          {Object.entries(DATASETS).map(
            ([key, datasetItem]) => (
              <option key={key} value={key}>
                {datasetItem.label}
              </option>
            )
          )}
        </select>

        <button
          type="button"
          onClick={startSimulation}
          disabled={running}
          style={{
            background: running
              ? 'rgba(99,102,241,0.3)'
              : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: running
              ? 'not-allowed'
              : 'pointer',
            transition: 'all 0.2s',
            minWidth: 160,
          }}
        >
          {starting
            ? '⏳ Starting...'
            : localStatus === 'SIMULATING'
              ? '⏳ Running...'
              : '▶ Start Simulation'}
        </button>

        <span
          style={{
            background: statusStyle.bg,
            color: statusStyle.text,
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {localStatus}
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#71717A',
          marginTop: 8,
        }}
      >
        {dataset.description} — {dataset.data.length} ticks
      </div>

      <div
        style={{
          fontSize: 10,
          color: '#3F3F46',
          marginTop: 8,
          wordBreak: 'break-all',
        }}
      >
        Simulator: {SIMULATOR_URL}
      </div>
    </div>
  );
};

/* ============================================================
   Prediction Tooltip
   ============================================================ */

function PredictionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload ?? {};

  return (
    <div className="bg-slate-950/95 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl min-w-[210px]">
      <div className="text-slate-400 mb-2 font-mono">
        {label}
      </div>

      <div className="space-y-1">
        <Row
          color="#ffffff"
          name="Actual RPS"
          value={fmt(point.actualRPS)}
        />

        <Row
          color="#3b82f6"
          name="Predicted Mean"
          value={fmt(point.predictedMean)}
        />

        <Row
          color="#f59e0b"
          name="Upper Bound"
          value={fmt(point.predictedUpper)}
        />

        <Row
          color="#60a5fa"
          name="Lower Bound"
          value={fmt(point.predictedLower)}
        />

        <Row
          color="#f59e0b"
          name="Active Servers"
          value={fmt(point.activeServers)}
        />

        <Row
          color="#22c55e"
          name="Required Servers"
          value={fmt(point.requiredServers)}
        />

        <Row
          color="#ef4444"
          name="Violations"
          value={fmt(point.violations)}
        />

        <Row
          color="#22c55e"
          name="SLA"
          value={
            point.slaReliability != null
              ? `${fmt(point.slaReliability, 2)}%`
              : '—'
          }
        />
      </div>
    </div>
  );
}

function Row({ color, name, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: color }}
        />

        <span className="text-slate-300">
          {name}
        </span>
      </span>

      <span className="font-bold tabular-nums text-white">
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   Agent Proof Panel
   ============================================================ */

function AgentProofPanel({ history, latest }) {
  if (!history || history.length < 2) {
    return null;
  }

  /*
   * Find peak actual RPS.
   */
  const peakRPS = Math.max(
    ...history.map(
      (point) => toNumber(point.actualRPS, 0)
    )
  );

  const peakTick = history.findIndex(
    (point) =>
      toNumber(point.actualRPS, 0) === peakRPS
  );

  /*
   * Find the FIRST tick where active servers increased.
   */
  const scaleEvent = history.findIndex(
    (point, index) =>
      index > 0 &&
      toNumber(point.activeServers, 0) >
        toNumber(
          history[index - 1].activeServers,
          0
        )
  );

  /*
   * Agent acted before the peak only if
   * scaling happened at an earlier chart tick.
   */
  const provisionLead =
    scaleEvent >= 0 &&
    peakTick >= 0 &&
    scaleEvent < peakTick
      ? peakTick - scaleEvent
      : null;

  /*
   * Get the most recent prediction.
   */
  const latestUpper =
    latest?.predictedUpper != null
      ? toNumber(latest.predictedUpper)
      : null;

  const latestMean =
    latest?.predictedMean != null
      ? toNumber(latest.predictedMean)
      : null;

  const agentActedEarly =
    provisionLead !== null &&
    provisionLead > 0;

  return (
    <div
      style={{
        background: agentActedEarly
          ? 'rgba(34,197,94,0.05)'
          : 'rgba(245,158,11,0.05)',
        border: agentActedEarly
          ? '1px solid rgba(34,197,94,0.2)'
          : '1px solid rgba(245,158,11,0.2)',
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: agentActedEarly
            ? '#22c55e'
            : '#f59e0b',
          marginBottom: 12,
        }}
      >
        🧠 Agent Proof
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        {/* Peak RPS */}

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#22c55e',
            }}
          >
            {peakRPS.toLocaleString()}
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#71717A',
              marginTop: 2,
            }}
          >
            Peak Actual RPS
          </div>
        </div>

        {/* Predicted mean */}

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#3b82f6',
            }}
          >
            {latestMean != null
              ? latestMean.toLocaleString(
                  undefined,
                  {
                    maximumFractionDigits: 0,
                  }
                )
              : '—'}
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#71717A',
              marginTop: 2,
            }}
          >
            Agent Prediction
          </div>
        </div>

        {/* Upper bound */}

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#f59e0b',
            }}
          >
            {latestUpper != null
              ? latestUpper.toLocaleString(
                  undefined,
                  {
                    maximumFractionDigits: 0,
                  }
                )
              : '—'}
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#71717A',
              marginTop: 2,
            }}
          >
            Agent Upper Bound
          </div>
        </div>

        {/* Provision lead */}

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: agentActedEarly
                ? '#22c55e'
                : '#f59e0b',
            }}
          >
            {agentActedEarly
              ? `${provisionLead}s early`
              : 'Monitoring'}
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#71717A',
              marginTop: 2,
            }}
          >
            Provisioned Before Peak
          </div>
        </div>
      </div>

      {/* Explanation */}

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop:
            '1px solid rgba(255,255,255,0.05)',
          fontSize: 11,
          color: '#71717A',
          textAlign: 'center',
        }}
      >
        {agentActedEarly
          ? `Agent increased capacity ${provisionLead} tick${
              provisionLead === 1 ? '' : 's'
            } before the traffic peak.`
          : 'Waiting for the agent to demonstrate proactive scaling before the traffic peak.'}
      </div>
    </div>
  );
}

/* ============================================================
   Dashboard
   ============================================================ */

const Dashboard = () => {
  const [chartData, setChartData] = useState([]);

  const [connected, setConnected] =
    useState(false);

  const [latestStatus, setLatestStatus] =
    useState('IDLE');

  const [logs, setLogs] = useState([]);

  const [selectedDataset, setSelectedDataset] =
    useState('flash_sale');

  /*
   * Used to make sure we don't accidentally keep
   * old simulation data when starting a new simulation.
   */
  const simulationIdRef = useRef(0);

  const lastHighLoadLog =
    useRef(0);

  const lastSlaAlarmLog =
    useRef(0);

  const lastRlAction =
    useRef(null);

  const loggedConnect =
    useRef(false);

  const previousLatestStatus =
    useRef('IDLE');

  /* ==========================================================
     Logging
     ========================================================== */

  const addLog = (message, type = 'info') => {
    const timestamp = new Date()
      .toISOString()
      .split('T')[1]
      .substring(0, 8);

    setLogs((previous) => [
      ...previous.slice(-49),
      {
        timestamp,
        msg: message,
        type,
      },
    ]);
  };

  /* ==========================================================
     Initial Logs
     ========================================================== */

  useEffect(() => {
    if (connected && !loggedConnect.current) {
      loggedConnect.current = true;
      addLog('Connected to simulator telemetry bus', 'info');
    }
  }, [connected]);

  /* ==========================================================
     Start New Simulation
     ========================================================== */

  const handleSimulationStarted = (
    datasetKey
  ) => {
    /*
     * Increment simulation ID.
     * Any stale metrics from a previous run are
     * discarded because chartData is cleared.
     */
    simulationIdRef.current += 1;

    setChartData([]);

    setLatestStatus('SIMULATING');

    lastHighLoadLog.current = 0;
    lastSlaAlarmLog.current = 0;
    lastRlAction.current = null;

    previousLatestStatus.current =
      'SIMULATING';

    const dataset =
      DATASETS[datasetKey];

    addLog(
      `Starting ${dataset?.label || datasetKey} simulation — ${
        dataset?.data.length || 0
      } ticks`,
      'info'
    );
  };

  /* ==========================================================
     Metrics Polling
     ========================================================== */

  useEffect(() => {
    let mounted = true;

    const pollMetrics = async () => {
      try {
        const response = await fetch(
          `${SIMULATOR_URL}/metrics`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          if (mounted) {
            setConnected(false);
          }

          return;
        }

        const data =
          await response.json();

        if (!mounted) {
          return;
        }

        setConnected(true);

        const currentStatus =
          data.status ?? 'IDLE';

        setLatestStatus(
          currentStatus
        );

        /* ----------------------------------------------------
           Status transition
        ---------------------------------------------------- */

        if (
          previousLatestStatus.current !==
            currentStatus &&
          currentStatus === 'FINISHED'
        ) {
          addLog(
            'Simulation finished — telemetry retained for Agent Proof',
            'success'
          );

          lastHighLoadLog.current = 0;
        }

        previousLatestStatus.current =
          currentStatus;

        /* ----------------------------------------------------
           Predictions

           Supports:
           predicted_mean
           predictedMean

           predicted_upper
           predictedUpper

           predicted_lower
           predictedLower
        ---------------------------------------------------- */

        const predictedMean =
          getPredictionValue(
            data,
            'predicted_mean',
            'predictedMean'
          );

        const predictedUpper =
          getPredictionValue(
            data,
            'predicted_upper',
            'predictedUpper'
          );

        const predictedLower =
          getPredictionValue(
            data,
            'predicted_lower',
            'predictedLower'
          );

        /* ----------------------------------------------------
           Current metrics
        ---------------------------------------------------- */

        const actualRPS = toNumber(
          data.current_rps ??
            data.currentRPS,
          0
        );

        const activeServers =
          toNumber(
            data.active_servers ??
              data.activeServers,
            0
          );

        const requiredServers =
          toNumber(
            data.required_servers ??
              data.requiredServers
          );

        const violations =
          toNumber(
            data.violations,
            0
          );

        const slaReliability =
          toNumber(
            data.sla_reliability ??
              data.slaReliability,
            100
          );

        const rawMlMean =
          getPredictionValue(
            data,
            'raw_ml_mean',
            'rawMlMean'
          );

        const zScore = toNumber(
          data.z_score ?? data.zScore
        );

        const rlAction = toNumber(
          data.rl_action ?? data.rlAction,
          2
        );

        const rlActionLabel =
          data.rl_action_label ??
          data.rlActionLabel ??
          null;

        const errorRatio = toNumber(
          data.error_ratio ?? data.errorRatio,
          0
        );

        const stdDev = toNumber(
          data.std_dev ?? data.stdDev,
          0
        );

        const stateVarianceNorm = toNumber(data.state_variance_norm ?? data.stateVarianceNorm);
        const stateSla = toNumber(data.state_sla ?? data.stateSla);
        const stateWasteNorm = toNumber(data.state_waste_norm ?? data.stateWasteNorm);
        const stateTrend = toNumber(data.state_trend ?? data.stateTrend);
        const stateHourSin = toNumber(data.state_hour_sin ?? data.stateHourSin);

        /* ----------------------------------------------------
           Confidence band

           Recharts stacked Areas require:

           base = lower bound
           width = upper - lower
        ---------------------------------------------------- */

        const bandBase =
          predictedLower != null
            ? predictedLower
            : null;

        const bandWidth =
          predictedUpper != null &&
          predictedLower != null
            ? Math.max(
                0,
                predictedUpper -
                  predictedLower
              )
            : null;

        /* ----------------------------------------------------
           Time
        ---------------------------------------------------- */

        const now =
          new Date();

        const timeStr =
          now.toLocaleTimeString(
            [],
            {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }
          );

        /* ----------------------------------------------------
           Chart point
        ---------------------------------------------------- */

        const newPoint = {
          time: timeStr,

          actualRPS,

          activeServers,

          requiredServers,

          violations,

          slaReliability,

          status:
            currentStatus,

          predictedMean,

          predictedUpper,

          predictedLower,

          bandBase,

          bandWidth,

          rawMlMean,

          zScore,

          rlAction,

          rlActionLabel,

          errorRatio,

          stdDev,

          stateVarianceNorm,

          stateSla,

          stateWasteNorm,

          stateTrend,

          stateHourSin,

          /*
           * Load-derived latency estimate (not measured P95).
           */
          latency:
            actualRPS > 0
              ? 120 +
                actualRPS / 50
              : 100,
        };

        /* ----------------------------------------------------
           Add point to history
        ---------------------------------------------------- */

        setChartData(
          (previous) => {
            /*
             * Avoid adding identical consecutive
             * FINISHED baseline points forever.
             */
            const last =
              previous[
                previous.length - 1
              ];

            if (
              last &&
              currentStatus ===
                'FINISHED' &&
              last.status ===
                'FINISHED' &&
              last.actualRPS ===
                actualRPS &&
              last.activeServers ===
                activeServers &&
              last.requiredServers ===
                requiredServers
            ) {
              return previous;
            }

            return [
              ...previous,
              newPoint,
            ].slice(-120);
          }
        );

        /* ----------------------------------------------------
           SLA Alarm
        ---------------------------------------------------- */

        if (
          slaReliability < 99
        ) {
          const nowMs =
            Date.now();

          if (
            nowMs -
              lastSlaAlarmLog.current >
            5000
          ) {
            lastSlaAlarmLog.current =
              nowMs;

            addLog(
              `SLA ALARM: reliability ${slaReliability.toFixed(
                2
              )}% — ${violations} violations`,
              'error'
            );
          }
        }

        if (
          rlAction != null &&
          lastRlAction.current !== rlAction
        ) {
          lastRlAction.current = rlAction;

          const logType =
            rlAction === 4
              ? 'warn'
              : rlAction === 3
                ? 'info'
                : 'info';

          addLog(
            `RL Agent: ${rlActionLabel} → z=${zScore?.toFixed(2) ?? '?'}, upper=${predictedUpper != null ? Math.round(predictedUpper).toLocaleString() : '?'} RPS, fleet=${requiredServers ?? '?'} servers`,
            logType
          );
        }

        /* ----------------------------------------------------
           High traffic logging
        ---------------------------------------------------- */

        if (
          actualRPS > 1000 &&
          currentStatus ===
            'SIMULATING'
        ) {
          const bucket =
            Math.floor(
              actualRPS / 500
            );

          if (
            bucket !==
            lastHighLoadLog.current
          ) {
            lastHighLoadLog.current =
              bucket;

            addLog(
              `High traffic: ${actualRPS.toLocaleString()} RPS — RL Agent scaling`,
              'warn'
            );
          }
        }

        /* ----------------------------------------------------
           Proactive scaling logging
        ---------------------------------------------------- */

        setChartData(
          (previous) => {
            const previousPoint =
              previous[
                previous.length - 1
              ];

            if (
              previousPoint &&
              activeServers >
                previousPoint.activeServers &&
              actualRPS <
                peakTrafficSoFar(
                  previous,
                  actualRPS
                )
            ) {
              /*
               * This is intentionally lightweight.
               * The Agent Proof Panel is the actual
               * source of truth.
               */
            }

            return previous;
          }
        );
      } catch (error) {
        console.error(
          '[Dashboard] Metrics error:',
          error
        );

        if (mounted) {
          setConnected(false);
        }
      }
    };

    /*
     * Immediately poll once instead of waiting
     * for the first 1-second interval.
     */
    pollMetrics();

    const interval =
      setInterval(
        pollMetrics,
        1000
      );

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  /* ==========================================================
     Latest telemetry
     ========================================================== */

  const latest =
    chartData[
      chartData.length - 1
    ];

  const rlLive =
    connected &&
    latest?.rlActionLabel != null &&
    latest.rlActionLabel.length > 0 &&
    latest?.zScore != null &&
    latest.zScore > 0;

  const slaCritical =
    (latest?.slaReliability ?? 100) <
    99;

  /* ==========================================================
     Render
     ========================================================== */

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-300 font-sans selection:bg-blue-500/30">

      {/* ======================================================
          SLA Alarm
      ====================================================== */}

      <AnimatePresence>
        {slaCritical && (
          <motion.div
            initial={{
              height: 0,
              opacity: 0,
            }}
            animate={{
              height: 'auto',
              opacity: 1,
            }}
            exit={{
              height: 0,
              opacity: 0,
            }}
            className="bg-red-600/90 text-white text-sm font-bold px-6 py-2 flex items-center justify-center gap-2 animate-pulse sticky top-0 z-[60]"
          >
            <AlertTriangle size={16} />

            SLA VIOLATION ALARM — Reliability{' '}
            {latest?.slaReliability?.toFixed(
              2
            )}
            % (threshold 99%)
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================
          Header
      ====================================================== */}

      <header className="border-b border-white/[0.06] bg-[#09090b]/95 backdrop-blur-sm sticky top-0 z-50 px-6 py-3 flex justify-between items-center">

        <div className="flex items-center gap-3">

          <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center text-blue-300 text-sm font-semibold">
            HT
          </div>

          <div className="flex flex-col">

            <span className="text-slate-100 font-semibold tracking-tight text-sm">
              HybridTimeNet
            </span>

            <span className="text-xs text-slate-500">
              Autoscaling control plane
            </span>

          </div>

        </div>

        <div className="flex items-center gap-4">

          <div
            className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full ${
              connected
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400 animate-pulse'
            }`}
          >

            <div
              className={`w-2 h-2 rounded-full ${
                connected
                  ? 'bg-green-400'
                  : 'bg-red-400'
              }`}
            />

            {connected
              ? 'Live'
              : 'Disconnected — start docker compose up'}
          </div>

          <div className="hidden md:flex items-center gap-8">

            <div className="flex flex-col items-end">

              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                Target Environment
              </span>

              <span className="text-xs text-white font-medium flex items-center gap-1.5">
                <Box
                  size={12}
                  className="text-slate-400"
                />

                NexusGear Storefront
              </span>

            </div>

            <div className="flex flex-col items-end">

              <span className="text-[10px] text-slate-500">
                RL predictor
              </span>

              <span
                className={`text-xs flex items-center gap-1.5 font-medium ${
                  rlLive
                    ? 'text-emerald-400'
                    : connected
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >

                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    rlLive
                      ? 'bg-emerald-500'
                      : connected
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                />

                {rlLive
                  ? 'Streaming decisions'
                  : connected
                    ? 'Awaiting RL data'
                    : 'Offline'}
              </span>

            </div>

          </div>

        </div>
      </header>

      {/* ======================================================
          Main
      ====================================================== */}

      <main className="p-6 max-w-[1800px] mx-auto relative z-10 space-y-6">

        {/* ====================================================
            Simulation Control
        ==================================================== */}

        <SimulationControlPanel
          latestStatus={
            latestStatus
          }
          selected={
            selectedDataset
          }
          setSelected={
            setSelectedDataset
          }
          onSimulationStarted={
            handleSimulationStarted
          }
        />

        {/* ====================================================
            Metric Cards
        ==================================================== */}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

          {[
            {
              label:
                'Gateway RPS',

              val:
                Math.round(
                  latest?.actualRPS ??
                    0
                ).toLocaleString(),

              sub:
                'Requests/sec',

              icon:
                Activity,

              color:
                'text-white',
            },

            {
              label:
                'Predicted Upper',

              val:
                latest?.predictedUpper !=
                null
                  ? Math.round(
                      latest.predictedUpper
                    ).toLocaleString()
                  : '—',

              sub:
                'Prediction confidence bound',

              icon:
                Zap,

              color:
                'text-amber-400',
            },

            {
              label:
                'Active Fleet',

              val:
                `${Math.ceil(
                  latest?.activeServers ??
                    0
                )}`,

              sub:
                'Provisioned Nodes',

              icon:
                Server,

              color:
                'text-amber-400',
            },

            {
              label:
                'Required Servers',

              val:
                latest?.requiredServers !=
                null
                  ? String(
                      latest.requiredServers
                    )
                  : '—',

              sub:
                'RL recommendation',

              icon:
                Server,

              color:
                'text-emerald-400',
            },

            {
              label:
                'SLA Reliability',

              val:
                `${(
                  latest?.slaReliability ??
                  100
                ).toFixed(1)}%`,

              sub:
                `${
                  latest?.violations ??
                  0
                } Violations`,

              icon:
                ShieldCheck,

              color:
                (latest?.slaReliability ??
                  100) >= 99
                  ? 'text-emerald-400'
                  : 'text-red-400 animate-pulse',
            },
          ].map(
            (stat, index) => (

              <motion.div
                initial={{
                  opacity: 0,
                  y: 20,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay:
                    index * 0.1,
                }}
                key={
                  stat.label
                }
                className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-5 hover:border-white/[0.1] transition-colors relative overflow-hidden group"
              >

                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">

                  <stat.icon
                    size={48}
                    className={
                      stat.color
                    }
                  />

                </div>

                <div className="flex justify-between items-start mb-4 relative z-10">

                  <div
                    className={`p-2 bg-white/5 rounded-lg ${stat.color}`}
                  >
                    <stat.icon
                      size={18}
                    />
                  </div>

                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {stat.label}
                  </span>

                </div>

                <div
                  className={`text-3xl font-bold tracking-tight tabular-nums relative z-10 ${stat.color}`}
                >
                  {stat.val}
                </div>

                <div className="text-xs text-slate-500 mt-2 font-medium relative z-10">
                  {stat.sub}
                </div>

              </motion.div>
            )
          )}

        </div>

        {/* ====================================================
            RL Agent Visualization
        ==================================================== */}

        <RlVisualizationPanel
          latest={latest}
          history={chartData}
          live={rlLive}
        />

        {/* ====================================================
            Traffic Chart
        ==================================================== */}

        <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-6">

          <div className="flex justify-between items-center mb-8">

            <div>

              <h4 className="text-sm font-semibold text-slate-100">
                Traffic & scaling
              </h4>

              <p className="text-xs text-slate-500 mt-0.5">
                Live RPS from simulator · forecast bands from predictor
              </p>

            </div>

            <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wider">

              <div className="flex items-center gap-2 text-white">
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
                Actual RPS
              </div>

              <div className="flex items-center gap-2 text-blue-400">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                RL Upper Bound
              </div>

              <div className="flex items-center gap-2 text-cyan-400">
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                Raw ML Forecast
              </div>

              <div className="flex items-center gap-2 text-blue-500">
                <div className="w-4 h-2.5 rounded-sm bg-blue-500/40" />
                Uncertainty Band
              </div>

              <div className="flex items-center gap-2 text-amber-400">
                <div className="w-2.5 h-2.5 bg-amber-400" />
                Servers
              </div>

            </div>

          </div>

          {/* Chart */}

          <div className="h-[400px] w-full">

            {!connected &&
            chartData.length === 0 ? (

              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Waiting for simulator at{' '}
                {SIMULATOR_URL}/metrics…
              </div>

            ) : (

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <ComposedChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -20,
                    bottom: 0,
                  }}
                >

                  <defs>

                    <linearGradient
                      id="bandFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >

                      <stop
                        offset="0%"
                        stopColor="#22c55e"
                        stopOpacity={0.30}
                      />

                      <stop
                        offset="100%"
                        stopColor="#22c55e"
                        stopOpacity={0.05}
                      />

                    </linearGradient>

                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ffffff0a"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: '#64748b',
                    }}
                    minTickGap={30}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: '#64748b',
                    }}
                  />

                  <Tooltip
                    content={
                      <PredictionTooltip />
                    }
                    cursor={{
                      stroke: '#334155',
                      strokeWidth: 1,
                      strokeDasharray:
                        '4 4',
                    }}
                  />

                  {/* ==========================================
                      Lower bound / base
                  ========================================== */}

                  <Area
                    type="monotone"
                    dataKey="bandBase"
                    stackId="confidence"
                    stroke="none"
                    fill="transparent"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* ==========================================
                      Confidence interval
                  ========================================== */}

                  <Area
                    type="monotone"
                    dataKey="bandWidth"
                    stackId="confidence"
                    stroke="none"
                    fill="url(#bandFill)"
                    connectNulls={false}
                    isAnimationActive={false}
                    name="Uncertainty Band"
                  />

                  {/* ==========================================
                      Predicted mean
                  ========================================== */}

                  <Line
                    type="monotone"
                    dataKey="rawMlMean"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    dot={false}
                    name="Raw ML Forecast"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="predictedMean"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    name="RL Upper Bound"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* ==========================================
                      Upper bound (same as RL target)
                  ========================================== */}

                  <Line
                    type="monotone"
                    dataKey="predictedUpper"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="2 4"
                    dot={false}
                    name="Upper Band Edge"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* ==========================================
                      Lower bound
                  ========================================== */}

                  <Line
                    type="monotone"
                    dataKey="predictedLower"
                    stroke="#60a5fa"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    dot={false}
                    name="Lower Bound"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* ==========================================
                      Required servers
                  ========================================== */}

                  <Line
                    type="stepAfter"
                    dataKey="requiredServers"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    isAnimationActive={false}
                    name="Required Servers"
                  />

                  {/* ==========================================
                      Active servers
                  ========================================== */}

                  <Line
                    type="stepAfter"
                    dataKey="activeServers"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name="Active Servers"
                  />

                  {/* ==========================================
                      Actual RPS
                  ========================================== */}

                  <Line
                    type="monotone"
                    dataKey="actualRPS"
                    stroke="#ffffff"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    name="Actual RPS"
                  />

                </ComposedChart>

              </ResponsiveContainer>

            )}

          </div>

          {/* ==================================================
              Agent Proof
          ================================================== */}

          <AgentProofPanel
            history={chartData}
            latest={latest}
          />

        </div>

        {/* ====================================================
            Lower Dashboard
        ==================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ==================================================
              Latency
          ================================================== */}

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">

            <h4 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">

              <Clock
                size={16}
                className="text-emerald-400"
              />

              Load-derived latency estimate

            </h4>

            <p className="text-[10px] text-slate-600 mb-4">
              Derived from RPS/capacity model — not measured P95
            </p>

            <div className="h-[200px] w-full">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <AreaChart
                  data={chartData}
                  margin={{
                    top: 0,
                    right: 0,
                    left: -20,
                    bottom: 0,
                  }}
                >

                  <defs>

                    <linearGradient
                      id="colorLatency"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >

                      <stop
                        offset="5%"
                        stopColor="#10b981"
                        stopOpacity={0.3}
                      />

                      <stop
                        offset="95%"
                        stopColor="#10b981"
                        stopOpacity={0}
                      />

                    </linearGradient>

                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ffffff0a"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="time"
                    hide
                  />

                  <YAxis
                    domain={[
                      'dataMin - 10',
                      'dataMax + 10',
                    ]}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: '#64748b',
                    }}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor:
                        '#0f172a',
                      border:
                        '1px solid #1e293b',
                      borderRadius:
                        '8px',
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="latency"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#colorLatency)"
                    isAnimationActive={false}
                  />

                </AreaChart>

              </ResponsiveContainer>

            </div>

          </div>

          {/* ==================================================
              SLA / Cost
          ================================================== */}

          <SlaCostVisualizer
            latest={latest}
            chartData={chartData}
          />

          {/* ==================================================
              Event Stream
          ================================================== */}

          <div className="bg-black border border-white/5 rounded-2xl p-6 font-mono relative overflow-hidden flex flex-col">

            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-purple-500" />

            <h4 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">

              <Terminal size={14} />

              Agent / Gateway Event Stream

            </h4>

            <div className="flex-1 overflow-y-auto space-y-2 text-xs custom-scrollbar max-h-[260px]">

              <AnimatePresence>

                {logs.map(
                  (log, index) => (

                    <motion.div
                      initial={{
                        opacity: 0,
                        x: -10,
                      }}
                      animate={{
                        opacity: 1,
                        x: 0,
                      }}
                      key={`${log.timestamp}-${index}`}
                      className="flex gap-3"
                    >

                      <span className="text-slate-600">
                        [
                        {
                          log.timestamp
                        }
                        ]
                      </span>

                      <span
                        className={`font-bold ${
                          log.type ===
                          'error'
                            ? 'text-red-400'
                            : log.type ===
                              'warn'
                              ? 'text-amber-400'
                              : log.type ===
                                'success'
                                ? 'text-emerald-400'
                                : 'text-blue-400'
                        }`}
                      >
                        {log.type
                          .toUpperCase()
                          .padEnd(7)}
                      </span>

                      <span className="text-slate-300">
                        {log.msg}
                      </span>

                    </motion.div>

                  )
                )}

              </AnimatePresence>

              {logs.length ===
                0 && (
                <div className="text-slate-600 italic">
                  Waiting for events...
                </div>
              )}

            </div>

          </div>

        </div>

      </main>

      {/* ======================================================
          Custom Scrollbar
      ====================================================== */}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>

    </div>
  );
};

/* ============================================================
   Helper used by proactive-scaling logic
   ============================================================ */

function peakTrafficSoFar(history, currentRPS) {
  if (!history?.length) {
    return currentRPS;
  }

  return Math.max(
    currentRPS,
    ...history.map(
      (point) =>
        toNumber(
          point.actualRPS,
          0
        )
    )
  );
}

export default Dashboard;
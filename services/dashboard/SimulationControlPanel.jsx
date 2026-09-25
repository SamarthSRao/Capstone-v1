import React, { useState } from 'react';

const SIMULATOR_URL =
  import.meta.env.VITE_SIMULATOR_URL ||
  (typeof window !== 'undefined' && window.location.hostname
    ? `${window.location.protocol}//${window.location.hostname}:8083`
    : 'http://localhost:8083');

/* ============================================================
   Simulation datasets
   ============================================================ */

const DATASETS = {
  'Organic Growth': {
    label: 'Organic Traffic',
    description: 'Steady baseline — 50 to 100 RPS',
    data: [
      50, 52, 55, 58, 60, 62, 65, 63, 70, 72,
      68, 75, 78, 80, 76, 72, 70, 68, 65, 60,
      58, 55, 60, 62, 65, 70, 72, 75, 78, 80,
      82, 80, 78, 75, 72, 70, 68, 65, 62, 60,
    ],
  },

  'Flash Sale': {
    label: '⚡ Flash Sale Spike',
    description: 'Organic → 2,500 RPS spike → cooldown',
    data: [
      50, 55, 60, 65, 70, 80, 100, 200, 500, 1000,
      1800, 2200, 2500, 2500, 2400, 2000, 1500, 1000,
      600, 400, 250, 150, 100, 80, 65, 55, 50, 50,
      50, 50,
    ],
  },

  'NASA Trace': {
    label: 'NASA HTTP Trace',
    description: 'Real 1995 NASA server traffic pattern',
    data: [
      120, 135, 140, 180, 210, 350, 620, 980, 1200, 1450,
      1600, 1580, 1420, 1300, 1200, 1100, 980, 850, 720,
      600, 480, 380, 280, 200, 160, 140, 130, 125, 120,
      118,
    ],
  },

  'Calgary Trace': {
    label: 'Calgary HTTP Trace',
    description: 'University server — sharp midday spike',
    data: [
      80, 85, 90, 95, 100, 120, 180, 320, 580, 850,
      1100, 1250, 1100, 900, 750, 600, 480, 380, 280,
      200, 160, 130, 110, 95, 88, 85, 82, 80, 80,
    ],
  },
};

/* ============================================================
   Status styles
   ============================================================ */

const STATUS_STYLES = {
  IDLE: {
    background: 'rgba(113, 113, 122, 0.2)',
    color: '#71717A',
  },

  SIMULATING: {
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
  },

  FINISHED: {
    background: 'rgba(59, 130, 246, 0.2)',
    color: '#3b82f6',
  },
};

/* ============================================================
   SimulationControlPanel
   ============================================================ */

export function SimulationControlPanel({
  selectedDataset,
  onDatasetChange,
  simStatus,
  isSimulating,
  activeSimulation,
  onStart,
  onLog,
}) {
  const [starting, setStarting] = useState(false);

  /* ------------------------------------------------------------
     Current dataset
     ------------------------------------------------------------ */

  const currentDataset =
    DATASETS[selectedDataset] || DATASETS['Organic Growth'];

  /* ------------------------------------------------------------
     Current status

     Dashboard is the source of truth.
     ------------------------------------------------------------ */

  const currentStatus = simStatus || 'IDLE';

  const statusStyle =
    STATUS_STYLES[currentStatus] || STATUS_STYLES.IDLE;

  /* ------------------------------------------------------------
     Running state

     Disable controls while simulation is being submitted
     or while Dashboard reports SIMULATING.
     ------------------------------------------------------------ */

  const running =
    starting ||
    isSimulating ||
    currentStatus === 'SIMULATING';

  /* ============================================================
     Start simulation
     ============================================================ */

  const startSimulation = async () => {
    if (running) {
      return;
    }

    const dataset =
      DATASETS[selectedDataset] || DATASETS['Organic Growth'];

    setStarting(true);

    if (onLog) {
      onLog(
        `Loading simulation dataset: ${dataset.label} — ${dataset.data.length} ticks`,
        'info'
      );
    }

    try {
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
        const responseText = await response.text();

        throw new Error(
          responseText ||
            `Simulator returned HTTP ${response.status}`
        );
      }

      let result = null;

      try {
        result = await response.json();
      } catch {
        // Some endpoints may return an empty/non-JSON response.
        // A successful HTTP response is still considered success.
      }

      console.log(
        '[SimulationControlPanel] Simulation started:',
        result
      );

      /*
       * IMPORTANT:
       * Tell Dashboard about the simulation only after the
       * simulator successfully accepted the workload.
       */
      if (onStart) {
        onStart(selectedDataset);
      }

      if (onLog) {
        onLog(
          `${dataset.label} started successfully — ${dataset.data.length} ticks loaded`,
          'success'
        );
      }
    } catch (error) {
      console.error(
        '[SimulationControlPanel] Failed to start simulation:',
        error
      );

      if (onLog) {
        onLog(
          `Failed to start simulation: ${
            error instanceof Error
              ? error.message
              : 'Unknown error'
          }`,
          'error'
        );
      }
    } finally {
      setStarting(false);
    }
  };

  /* ============================================================
     Render
     ============================================================ */

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #252525',
        borderRadius: 12,
        padding: 20,
        height: '100%',
      }}
    >
      {/* ========================================================
          Header
          ======================================================== */}

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#E7E6D9',
          marginBottom: 16,
        }}
      >
        Simulation Control
      </div>

      {/* ========================================================
          Dataset selector
          ======================================================== */}

      <div style={{ marginBottom: 14 }}>
        <label
          htmlFor="simulation-dataset"
          style={{
            display: 'block',
            fontSize: 11,
            color: '#71717A',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Dataset
        </label>

        <select
          id="simulation-dataset"
          value={selectedDataset}
          onChange={(event) =>
            onDatasetChange(event.target.value)
          }
          disabled={running}
          style={{
            width: '100%',
            background: '#111111',
            color: '#E7E6D9',
            border: '1px solid #252525',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            cursor: running
              ? 'not-allowed'
              : 'pointer',
            opacity: running ? 0.6 : 1,
            outline: 'none',
          }}
        >
          {Object.entries(DATASETS).map(
            ([key, dataset]) => (
              <option
                key={key}
                value={key}
              >
                {dataset.label}
              </option>
            )
          )}
        </select>
      </div>

      {/* ========================================================
          Dataset information
          ======================================================== */}

      <div
        style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid #202020',
          borderRadius: 8,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            color: '#E7E6D9',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {currentDataset.label}
        </div>

        <div
          style={{
            color: '#71717A',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {currentDataset.description}
        </div>

        <div
          style={{
            color: '#52525B',
            fontSize: 11,
            marginTop: 6,
          }}
        >
          {currentDataset.data.length} simulation ticks
        </div>
      </div>

      {/* ========================================================
          Start button + status
          ======================================================== */}

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={startSimulation}
          disabled={running}
          style={{
            flex: 1,
            minWidth: 150,
            background: running
              ? 'rgba(99,102,241,0.3)'
              : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: running
              ? 'not-allowed'
              : 'pointer',
            transition: 'all 0.2s',
            opacity: running ? 0.7 : 1,
          }}
        >
          {starting
            ? '⏳ Starting...'
            : currentStatus === 'SIMULATING'
            ? '⏳ Running...'
            : '▶ Start Simulation'}
        </button>

        <span
          style={{
            background: statusStyle.background,
            color: statusStyle.color,
            borderRadius: 20,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {currentStatus}
        </span>
      </div>

      {/* ========================================================
          Active simulation
          ======================================================== */}

      {activeSimulation && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop:
              '1px solid rgba(255,255,255,0.05)',
            fontSize: 11,
            color: '#52525B',
          }}
        >
          Active:{' '}
          {DATASETS[activeSimulation]?.label ||
            activeSimulation}
        </div>
      )}

      {/* ========================================================
          Simulator endpoint
          ======================================================== */}

      <div
        style={{
          marginTop: 12,
          fontSize: 10,
          color: '#3F3F46',
          wordBreak: 'break-all',
        }}
      >
        Simulator: {SIMULATOR_URL}
      </div>
    </div>
  );
}

export default SimulationControlPanel;
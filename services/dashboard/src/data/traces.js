/**
 * HT-307 — Workload trace datasets (120 ticks each).
 * Posted to the Go Simulator via POST /start-simulation { workload }.
 */

function organicGrowth() {
  return Array.from({ length: 120 }, (_, i) =>
    200 + Math.floor(i * 1.5) + Math.floor(Math.sin(i / 10) * 20)
  );
}

function flashSaleSpike() {
  return [
    ...Array(15).fill(150),
    ...Array(40)
      .fill(2500)
      .map((v) => v + Math.floor(Math.random() * 400)),
    ...Array(30)
      .fill(1000)
      .map((v) => v + Math.floor(Math.random() * 200)),
    ...Array(35).fill(200),
  ];
}

function botDDoSAttack() {
  return [
    ...Array(20).fill(100),
    ...Array(5).fill(4000),
    ...Array(20).fill(150),
    ...Array(5).fill(4000),
    ...Array(70).fill(100),
  ];
}

export const DATASETS = {
  'Organic Growth': {
    desc: 'Gradual organic traffic ramp (≈200–400 RPS)',
    build: organicGrowth,
  },
  'Flash Sale Spike': {
    desc: 'Massive spike (2K+ RPS) after a quiet warm-up',
    build: flashSaleSpike,
  },
  'Bot DDoS Attack': {
    desc: 'Sudden extreme bursts interleaved with quiet periods',
    build: botDDoSAttack,
  },
};

export const DATASET_NAMES = Object.keys(DATASETS);

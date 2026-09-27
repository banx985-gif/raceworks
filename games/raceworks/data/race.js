// Race simulation rules (Milestone 6; bible §23.3–23.6). Plain data only; src/race/raceSim.js runs them.
// Numbers marked PLACEHOLDER are Claude Code's (docs/DECISIONS.md).

export const RACE = {
  dt: 0.05, // simulation step in race seconds (fixed: watching and skipping step the same model)
  // Watch speeds (bible §24.5): race seconds per real second at 1× (then ×2, ×4). PLACEHOLDER: an 8-lap race takes
  // about 4 minutes at 1×, 1 minute at 4×.
  watchTimeScale: 3,
  speeds: [1, 2, 4],
  startLights: 3, // race seconds of red lights before the start
  launchDelay: { min: 0.15, spread: 0.3 }, // each car's seeded reaction at the lights
  accel: 7, // m/s² a car can gain speed at (braking is instant: the segment target already includes it)
  // paceScore (bible §23.4) = 0.56 carFit + 0.24 driverFactor + 0.10 crewFactor + 0.10 setupScore, each ~0–1:
  pace: { car: 0.56, driver: 0.24, crew: 0.1, setup: 0.1, carNorm: 400, driverNorm: 400, crewNorm: 400, setupDefault: 0.5 },
  // Player crew factor (0–400) from the best staff member's stat in each role (bible §23.4 crewFactor mix).
  crewMix: { ENG: 0.4, STR: 0.2, MEC: 0.25, AER: 0.15 },
  // paceCurve: time multiplier = 1 − slope × (paceScore − ref), clamped. PLACEHOLDER.
  paceCurve: { ref: 0.4, slope: 0.5, min: 0.8, max: 1.3 },
  // Bounded seeded variance per segment (bible §23.4): ± maxPct, narrowed by Consistency but never below minShare.
  variance: { maxPct: 2.2, consistencyFull: 400, minShare: 0.25 },
  // Traffic (bible §23.3, §23.5): a car cannot drive through the one ahead; it passes only in an overtake zone.
  traffic: { minGap: 7, hardGap: 4.5, attemptGap: 11, draftRange: [6, 32], draftPct: 2.5 },
  overtake: { base: 0.3, pacePer1Pct: 0.08, racecraftPer100: 0.25, difficulty: 0.35, min: 0.05, max: 0.85, failSlowPct: 4, failSlowSecs: 1.5, contactChance: 0.02, contactSlowSecs: 2.5, laneOffset: 3.4, passMargin: 7 },
  // Lanes: each car keeps a small seeded lane bias so a train of cars never draws as one sprite.
  laneBias: 0.9,
  laneSpeed: 1.6, // how fast a car moves sideways (share of the gap per second)
  carHalfWidth: 1.0, // metres (a club car is ~2 m wide): lateral offsets keep the whole car inside the corridor
  edgeMargin: 0.6,
  // Mechanical failure (bible §23.6), kept mild: a roll each lap.
  failure: { basePerLap: 0.004, relRef: 200, relSpan: 150, perOpenFault: 0.6, lowConditionBelow: 50, lowConditionX: 1.5, share: { paceLoss: 0.6, damage: 0.32, retire: 0.08 }, paceLossPct: 7, paceLossLaps: 1, damagePct: 2.5 },
  // What the race does to the player's car (Condition 0–100; repaired in the Car Garage, Milestone 5).
  wear: { perLap: 1, failure: 10, contact: 5 },
  tieBreak: 'finishTime',
};

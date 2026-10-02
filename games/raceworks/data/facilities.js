// Facilities and the garage floor (Milestone 10, bible §19 / §19.1 / §6.4). Plain data only: the shared
// core/FacilitySystem holds the layout, src/systems/garageFacilities.js adds money, unlocks and the effect queries.
//
// Every facility: id, name, role (bible §6.4 station role), unlock ({} = Start, { rank }, { research }, Milestone 27:
// { year, trophies }), cost (bible),
// effectText (the bible's words), effects [{ key, value }] (summed by core/FacilitySystem.total(key)), art,
// size { w, h } in grid cells (col × row; not in the bible — chosen to match each picture, see DECISIONS.md),
// draw { width: art width as a share of the footprint's drawn width, drop: how far below the footprint's front corner
// the art's base sits, in cell heights }, purpose (the sheet's one line).
//   keep: the reason it can't be sold (the garage always needs it); it can still be moved.
//   research: true = a research station (its sheet leads to the Research tree, Milestone 11).
//
// Effect keys (what systems ask for — never "is F05 built?"):
//   workPct.<role>             +% work from staff of that role on every car phase (core/ProjectSystem workerModifier)
//   phaseSpeedPct.<area>       +% car phase speed for phases covering that area (PHASE_AREAS below)
//   carBays                    active cars the garage can build at once (0 = no car can be started)
//   materialCostPct            ±% on a car's class and parts price at Start
//   setupKnowledge             + Setup Knowledge after practice (race weekends)
//   dev.<stat>                 + development points on a finished car's stat (SPD ACC COR BRK REL EFF TYR)
//   tyreWearPct                ±% race tyre wear for your car
//   telemetry                  1 = your races run with telemetry on (Milestone 21: HexaCom's obligation; the Telemetry Room)
//   revealReputation           + Reputation when a finished car is revealed
//   researchSpeedPct.<branch>  +% research speed on that branch's nodes (Milestone 11: CFD Station AER, Engine Lab PWR)
//   forecast                   + race forecast accuracy — STORED: forecasts arrive with weather (later milestone)
//   unlock.<feature>           1 = that feature is open: Auto Training (Milestone 12: staff training needs it) — STORED:
//                              manual drills (Milestone 14) and the sponsor portfolio (Milestone 21: +1 sponsor offer a month).
//   clueAfterEnding            Milestone 27: 1 = after the Year-16 ending every secret's clue is one more stage on (F29)
//   trainingSeats.<slot>       Milestone 12: training capacity — simulator = people on the Driver Simulator course at
//                              once; study = extra training places for the other courses (data/training.js)

export const FACILITIES = [
  {
    id: 'F01', name: 'Basic Workbench', role: 'Maker', unlock: {}, cost: 1200,
    effectText: '+6% mechanic work on car phases',
    effects: [{ key: 'workPct.mechanic', value: 6 }],
    art: 'facility_f01', size: { w: 3, h: 2 }, draw: { width: 1.04, drop: 0.3 },
    purpose: 'Tools and a bench: mechanics get more done on every car phase.',
  },
  {
    id: 'F02', name: 'Pit Bay', role: 'Maker', unlock: {}, cost: 1800,
    effectText: 'Required to build/maintain one active car',
    effects: [{ key: 'carBays', value: 1 }],
    art: 'facility_f02', size: { w: 4, h: 4 }, draw: { width: 1.08, drop: 0.35 },
    purpose: 'Start a car project and work on the active build.',
    keep: 'The garage needs its Pit Bay to build cars',
  },
  {
    id: 'F03', name: 'Engine Bench', role: 'Specialist', unlock: {}, cost: 1400,
    effectText: '+8% Power Unit phase speed',
    effects: [{ key: 'phaseSpeedPct.power', value: 8 }],
    art: 'facility_f03', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Engines are built and tuned here: the Powertrain phase goes faster.',
  },
  {
    id: 'F04', name: 'Basic Dyno', role: 'Specialist', unlock: { rank: 'D' }, cost: 2400,
    effectText: '+6 setup knowledge; +5 Power development',
    effects: [{ key: 'setupKnowledge', value: 6 }, { key: 'dev.SPD', value: 2.5 }, { key: 'dev.ACC', value: 2.5 }],
    art: 'facility_f04', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'A rolling road: more power in every car and a head start on setups.',
  },
  {
    id: 'F05', name: 'Chassis Jig', role: 'Specialist', unlock: {}, cost: 1500,
    effectText: '+8% Chassis phase speed',
    effects: [{ key: 'phaseSpeedPct.chassis', value: 8 }],
    art: 'facility_f05', size: { w: 3, h: 3 }, draw: { width: 0.98, drop: 0.3 },
    purpose: 'Holds the frame true while it is built: the Chassis & Aero phase goes faster.',
  },
  {
    id: 'F06', name: 'Alignment Rig', role: 'Specialist', unlock: { rank: 'D' }, cost: 1900,
    effectText: '+6 Cornering development',
    effects: [{ key: 'dev.COR', value: 6 }],
    art: 'facility_f06', size: { w: 3, h: 3 }, draw: { width: 1.0, drop: 0.3 },
    purpose: 'Wheel alignment to the millimetre: every car corners better.',
  },
  {
    id: 'F07', name: 'Tyre Station', role: 'Specialist', unlock: { rank: 'D' }, cost: 1600,
    effectText: '-5% race tyre wear after prep',
    effects: [{ key: 'tyreWearPct', value: -5 }],
    art: 'facility_f07', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Tyres prepped before every race wear a little slower.',
  },
  {
    id: 'F08', name: 'Brake Station', role: 'Specialist', unlock: { rank: 'D' }, cost: 1700,
    effectText: '+6 Braking development',
    effects: [{ key: 'dev.BRK', value: 6 }],
    art: 'facility_f08', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Brakes bedded in and balanced: every car stops better.',
  },
  {
    id: 'F09', name: 'Gearbox Bench', role: 'Specialist', unlock: { research: 'TRN1' }, cost: 1800,
    effectText: '+8% Transmission phase speed',
    effects: [{ key: 'phaseSpeedPct.transmission', value: 8 }],
    art: 'facility_f09', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Gearboxes built and shimmed here: the Powertrain phase goes faster.',
  },
  {
    id: 'F10', name: 'Aero Desk', role: 'Specialist', unlock: {}, cost: 1500,
    effectText: '+8% Aero phase speed',
    effects: [{ key: 'phaseSpeedPct.aero', value: 8 }],
    art: 'facility_f10', size: { w: 2, h: 2 }, draw: { width: 1.1, drop: 0.3 },
    purpose: 'Screens full of airflow: the car is drawn here, and the Chassis & Aero phase goes faster.',
  },
  {
    id: 'F11', name: 'Strategy Desk', role: 'Thinker', unlock: {}, cost: 1300,
    effectText: '+8% Strategist work; forecast +3',
    effects: [{ key: 'workPct.strategist', value: 8 }, { key: 'forecast', value: 3 }],
    art: 'facility_f11', size: { w: 2, h: 3 }, draw: { width: 1.12, drop: 0.3 },
    purpose: 'Research, race forecasts and strategy.',
    keep: 'The Strategy Desk is where your crew plans: it stays',
    research: true,
  },
  {
    id: 'F12', name: 'Driver Simulator', role: 'Rest/Training', unlock: {}, cost: 1800,
    effectText: 'Unlocks Auto Training and manual drills',
    effects: [{ key: 'unlock.autoTraining', value: 1 }, { key: 'unlock.manualDrills', value: 1 }, { key: 'trainingSeats.simulator', value: 1 }],
    art: 'facility_f12', size: { w: 2, h: 2 }, draw: { width: 1.08, drop: 0.3 },
    purpose: 'Laps on screen: drivers test the car here, and it opens staff training (one person on the simulator at a time).',
  },
  {
    id: 'F13', name: 'Parts Rack', role: 'Support', unlock: {}, cost: 900,
    effectText: '-3% car build material cost',
    effects: [{ key: 'materialCostPct', value: -3 }],
    art: 'facility_f13', size: { w: 2, h: 1 }, draw: { width: 1.12, drop: 0.25 },
    purpose: 'Spares on the shelf: every car costs a little less to build.',
  },
  {
    id: 'F14', name: 'Detail Bay', role: 'Showcase', unlock: { rank: 'D' }, cost: 1200,
    effectText: '+4 Reputation on car reveal',
    effects: [{ key: 'revealReputation', value: 4 }],
    art: 'facility_f14', size: { w: 3, h: 3 }, draw: { width: 1.0, drop: 0.3 },
    purpose: 'A polish before the reveal: every finished car earns a little more Reputation.',
  },
  {
    id: 'F15', name: 'Sponsor Wall', role: 'Front desk', unlock: { rank: 'C' }, cost: 2000,
    effectText: 'Unlocks sponsor portfolio screen',
    effects: [{ key: 'unlock.sponsorPortfolio', value: 1 }],
    art: 'facility_f15', size: { w: 3, h: 1 }, draw: { width: 1.1, drop: 0.25 },
    purpose: 'Logos on the wall: the sponsor portfolio opens with it (sponsors come later).',
  },
  // Milestone 11: the facilities research opens (bible §19 F16–F24, F33; the node from §20). Effects the game can't use
  // yet are STORED (see the key list above): setupKnowledge.technical (track types), chassisCostPct.highTier,
  // reliabilityData, unlock.hybridProjects, forecast.
  {
    id: 'F16', name: 'Wind Tunnel', role: 'Specialist', unlock: { research: 'AER4' }, cost: 6500,
    effectText: '+12 Aero development; +5 setup knowledge on technical tracks',
    effects: [{ key: 'dev.COR', value: 12 }, { key: 'setupKnowledge.technical', value: 5 }],
    art: 'facility_f16', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'Air over a scale car: every car corners better.',
  },
  {
    id: 'F17', name: 'CFD Station', role: 'Specialist', unlock: { research: 'AER5' }, cost: 7200,
    effectText: '+15% Aero research speed',
    effects: [{ key: 'researchSpeedPct.AER', value: 15 }],
    art: 'facility_f17', size: { w: 2, h: 2 }, draw: { width: 1.08, drop: 0.3 },
    purpose: 'Airflow on screen: Aerodynamics research goes faster.',
    research: true,
  },
  {
    id: 'F18', name: 'Carbon Fabrication', role: 'Specialist', unlock: { research: 'CHA4' }, cost: 7600,
    effectText: '+10 Chassis development; -5% high-tier chassis cost',
    effects: [{ key: 'dev.REL', value: 5 }, { key: 'dev.COR', value: 5 }, { key: 'chassisCostPct.highTier', value: -5 }],
    art: 'facility_f18', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'Carbon laid up in-house: every chassis comes out stronger.',
  },
  {
    id: 'F19', name: 'Advanced Dyno', role: 'Specialist', unlock: { research: 'PWR4' }, cost: 8000,
    effectText: '+14 Power development; reliability data',
    effects: [{ key: 'dev.SPD', value: 7 }, { key: 'dev.ACC', value: 7 }, { key: 'reliabilityData', value: 1 }],
    art: 'facility_f19', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'A full engine dyno: much more power in every car.',
  },
  {
    id: 'F20', name: 'Engine Lab', role: 'Specialist', unlock: { research: 'PWR5' }, cost: 9000,
    effectText: '+15% Powertrain research speed',
    effects: [{ key: 'researchSpeedPct.PWR', value: 15 }],
    art: 'facility_f20', size: { w: 3, h: 3 }, draw: { width: 1.0, drop: 0.3 },
    purpose: 'Engines taken apart and measured: Powertrain research goes faster.',
    research: true,
  },
  {
    id: 'F21', name: 'Hybrid Lab', role: 'Specialist', unlock: { research: 'PWR6' }, cost: 11000,
    effectText: 'Unlocks hybrid/electric special projects',
    effects: [{ key: 'unlock.hybridProjects', value: 1 }],
    art: 'facility_f21', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'Batteries and motors: hybrid and electric special projects open with it (later).',
  },
  {
    id: 'F22', name: 'Telemetry Room', role: 'Specialist', unlock: { research: 'ELE3' }, cost: 7800,
    effectText: '+18 practice setup knowledge',
    effects: [{ key: 'setupKnowledge', value: 18 }, { key: 'telemetry', value: 1 }], // (telemetry: Milestone 21)
    art: 'facility_f22', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'Every lap on screens: practice teaches the crew much more about the setup.',
  },
  // Milestone 17 build-shop pass: the Strategy Room (bible §19 'Strategy milestone + Rank B'; the strategy milestone, M16,
  // is done, so it opens at Rank B). Its effects were already read by the M16 planner and forecast.
  {
    id: 'F23', name: 'Strategy Room', role: 'Thinker', unlock: { rank: 'B' }, cost: 8200,
    effectText: 'Forecast uncertainty -15%; Auto Strategy +8%',
    effects: [{ key: 'forecastUncertaintyPct', value: -15 }, { key: 'autoStrategyPct', value: 8 }],
    art: 'facility_f23', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'Screens, maps and a big table: sharper race forecasts and a better Auto Strategy.',
  },
  {
    id: 'F24', name: 'Tyre Lab', role: 'Specialist', unlock: { research: 'HAN4' }, cost: 7600,
    effectText: 'Tyre compounds gain +8% life',
    effects: [{ key: 'tyreWearPct', value: -7.4 }],
    art: 'facility_f24', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Rubber tested to the limit: every tyre lasts longer.',
  },
  // Milestone 20: the two facilities the championship ladder asks for (bible §27 C07 / C08, §19). Their effects are STORED
  // until their systems exist. F32's bible unlock is "Endurance Masters unlocked" while C08 needs F32 — a loop — so it opens
  // at Rank B, C08's own rank (PLACEHOLDER, DECISIONS.md).
  {
    id: 'F30', name: 'Prototype Bay', role: 'Maker', unlock: { rank: 'A' }, cost: 12000,
    effectText: 'Required for Prototype/Experimental class',
    effects: [{ key: 'unlock.prototypeClass', value: 1 }],
    art: 'facility_f30', size: { w: 4, h: 4 }, draw: { width: 1.06, drop: 0.35 },
    purpose: 'A bay for prototypes: it opens the Prototype Challenge (and the prototype class, later).',
  },
  {
    id: 'F32', name: 'Endurance Ops', role: 'Thinker', unlock: { rank: 'B' }, cost: 9000,
    effectText: 'Pit/strategy errors -10% in long races',
    effects: [{ key: 'longRaceErrorPct', value: -10 }],
    art: 'facility_f32', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'An operations room for long races: it opens Endurance Masters.',
  },
  {
    id: 'F33', name: 'Weather Station', role: 'Thinker', unlock: { research: 'ELE5' }, cost: 8500,
    effectText: 'Forecast accuracy +20%',
    effects: [{ key: 'forecast', value: 20 }],
    art: 'facility_f33', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Wind, rain and track temperature: better race forecasts (weather comes later).',
  },
  // Milestone 27: the Heritage Room (bible §19 F29 "NG+ clue gain +1 after ending"): from Year 8 with 3 trophies; after the
  // Year-16 ending it adds one more clue stage to every secret in the Rumour Archive (on top of the ending's own +1).
  {
    id: 'F29', name: 'Heritage Room', role: 'Showcase', unlock: { year: 8, trophies: 3 }, cost: 6800,
    effectText: 'NG+ clue gain +1 after ending',
    effects: [{ key: 'clueAfterEnding', value: 1 }],
    art: 'facility_f29', size: { w: 2, h: 2 }, draw: { width: 1.06, drop: 0.3 },
    purpose: 'Old cars, old photos, old stories: after the Year-16 ending its rumours run one step clearer.',
  },
  // Milestone 25: the two secret facilities (bible §19 F34 / F35, §36.4). Never in the shop until their secret is found
  // (unlock.secret); their effects are STORED for later systems (secret-part research, prestige builds, the rival clue hub).
  // F35 opens the Ghost Annex (EXPANSIONS below), a separate room it can stand in.
  {
    id: 'F34', name: 'Black Lab', role: 'Secret', unlock: { secret: 'SEC-FAC-01' }, cost: 18000,
    effectText: 'Secret part research +20%; unlocks prestige experiments',
    effects: [{ key: 'researchSpeedPct.secret', value: 20 }, { key: 'unlock.prestigeExperiments', value: 1 }],
    art: 'facility_f34', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'A room that is not on the floor plan: secret-part research and prestige experiments.',
  },
  {
    id: 'F35', name: 'Ghost Garage', role: 'Secret', unlock: { secret: 'SEC-FAC-02' }, cost: 22000,
    effectText: 'Prestige car build speed +15%; secret-rival clue hub',
    effects: [{ key: 'prestigeBuildPct', value: 15 }, { key: 'unlock.rivalClueHub', value: 1 }],
    art: 'facility_f35', size: { w: 3, h: 3 }, draw: { width: 1.02, drop: 0.3 },
    purpose: 'Ghostline’s old annex: prestige cars come together faster here.',
    secretRoom: 'ghost', // built into the Ghost Annex when there is room
  },
];

// The rest spot (Milestone 1; Milestone 8 art): not a bible facility — it stays, can be moved, costs nothing.
export const REST_SPOT = {
  id: 'REST', name: 'Rest Spot', role: 'Rest', unlock: {}, cost: 0, effectText: 'Tired staff get their Energy back here',
  effects: [], art: 'facility_f26', size: { w: 2, h: 2 }, draw: { width: 1.02, drop: 0.3 }, tag: true,
  purpose: 'A bench and a drink: tired staff come here to get their Energy back.',
  keep: 'Your crew needs somewhere to rest',
};

// Props (garage dressing): no effect, never sold, but they can be moved in Build Mode.
export const PROPS = [
  { id: 'P01', name: 'Tyre Stack', art: 'race_prop_01' },
  { id: 'P04', name: 'Wheel-Gun Trolley', art: 'race_prop_04' },
  { id: 'P06', name: 'Racing Jack', art: 'race_prop_06' },
  { id: 'P08', name: 'Fire-Safety Station', art: 'race_prop_08' },
  { id: 'P09', name: 'Helmet Rack', art: 'race_prop_09' },
  { id: 'P11', name: 'Spare Wing Rack', art: 'race_prop_11' },
].map((p) => ({ ...p, prop: true, role: 'Prop', unlock: {}, cost: 0, effects: [], size: { w: 1, h: 1 }, draw: { width: 1.18, drop: 0.25 }, purpose: 'Garage kit: it makes the place look like a race team works here.', keep: 'Props can be moved, not sold' }));

export const SELL_REFUND_PCT = 50; // bible §19

// The garage floor (bible §19.1). The Starter Garage is the Milestone 1 room (12 × 16 cells); each wing is a block of
// floor that opens later. Walls run along row 0 and col 0 over the whole building, so a wing grows the room forward.
//   rank: the rank that opens it (automatically, no cost — see DECISIONS.md; M10 opened the Bay Extension, M27 the
//   three higher wings, greyed floor until then). secret: never drawn until opened (the Ghost Annex, F35).
export const STARTER_AREA = { id: 'starter', name: 'Starter Garage', cols: 12, rows: 16 };
export const EXPANSIONS = [
  { id: 'bay', name: 'Bay Extension', rank: 'D', col: 12, row: 0, w: 4, h: 16, requires: [] },
  { id: 'engineering', name: 'Engineering Wing', rank: 'C', col: 0, row: 16, w: 16, h: 6, requires: ['bay'] },
  { id: 'raceOps', name: 'Race Operations Wing', rank: 'B', col: 16, row: 0, w: 4, h: 22, requires: ['engineering'] },
  { id: 'worldAnnex', name: 'World Team Annex', rank: 'A', col: 0, row: 22, w: 20, h: 4, requires: ['raceOps'] },
  // F35 Ghost Garage's secret room (SEC-FAC-02): a separate room with its own entrance, below the building. Hidden.
  { id: 'ghost', name: 'Ghost Annex', secret: 'SEC-FAC-02', col: 0, row: 27, w: 6, h: 4, requires: [], entrance: { col: 0, row: 27 } },
];

// Where people come in (always kept clear; every station must be reachable from here): the door in the left wall.
export const ENTRANCE = { col: 0, row: 14 };

// The starting garage (bible §19: ~8 functional stations plus props, already placed). col/row = the back corner.
export const START_LAYOUT = [
  // The big Pit Bay stands out on the floor, in front, so the build on it is always in view (Milestone 1 had it
  // against the back; the old saves' Pit Bay, Strategy Desk and rest spot move here with the rest of the garage).
  { def: 'F02', col: 7, row: 5 }, // Pit Bay
  // Along the right-hand back wall: Workbench, Engine Bench, Parts Rack, Chassis Jig.
  { def: 'F01', col: 1, row: 0 },
  { def: 'F03', col: 5, row: 0 },
  { def: 'F13', col: 7, row: 0 },
  { def: 'F05', col: 9, row: 0 },
  // Along the left-hand wall: Aero Desk, Strategy Desk, Driver Simulator (the door is further down).
  { def: 'F10', col: 0, row: 3 },
  { def: 'F11', col: 0, row: 6 },
  { def: 'F12', col: 0, row: 10 },
  { def: 'REST', col: 4, row: 12 }, // Rest Spot, out on the floor near the door
  // Props.
  { def: 'P11', col: 4, row: 0 }, // Spare Wing Rack
  { def: 'P09', col: 0, row: 0 }, // Helmet Rack, in the back corner
  { def: 'P08', col: 0, row: 9 }, // Fire-Safety Station
  { def: 'P01', col: 11, row: 4 }, // Tyre Stack
  { def: 'P04', col: 11, row: 10 }, // Wheel-Gun Trolley
  { def: 'P06', col: 6, row: 9 }, // Racing Jack
];

// Which facilities each car phase is worked at (style guide §5: staff walk to the right station for each stage). The
// car's team takes these in turn (slot order); a station that isn't built is skipped; with none, they work at the Pit Bay.
export const PHASE_STATIONS = {
  concept: ['F10', 'F11', 'F02'],
  chassisAero: ['F05', 'F10', 'F02'],
  powertrain: ['F03', 'F09', 'F01', 'F02'],
  assembly: ['F02', 'F01', 'F13'],
  testing: ['F12', 'F02', 'F04'],
};

// Car phases → the areas whose phaseSpeedPct counts for them (each facility's bonus applies in full to its phase).
export const PHASE_AREAS = {
  concept: [],
  chassisAero: ['chassis', 'aero'],
  powertrain: ['power', 'transmission'],
  assembly: [],
  testing: [],
};

// Build Mode words.
export const BUILD_TEXT = {
  hint: 'Drag to move · tap to sell · Shop to build',
  debt: 'No building while on Emergency Credit',
  noSpot: 'No free spot for it: move or sell something first',
  owned: 'Already in the garage',
};

// Milestone 25b (series common feature §3): facility levels 1–3, on core/FacilitySystem levels. PLACEHOLDERS
// (DECISIONS.md, M25b): every number here.
//   cost: level 2 = ×0.6 of the build price, level 3 = ×0.9 (Credits, through the ledger)
//   rank: level 2 needs one rank above the facility's build rank, level 3 two above (never past S). A Start facility's
//     build rank is E; one opened by research counts as RESEARCH_BUILD_RANK, a secret one as SECRET_BUILD_RANK.
//   days: game days to finish (it works at the old level meanwhile)
//   mult: each effect ×1.0 / ×1.5 / ×2.0 through the effect queries — except the keys in NO_SCALE (counts and unlock
//     flags: a second Pit Bay level must not mean a second car bay), which never change.
//   LEVEL_BONUS: facilities whose effects are all counts or unlocks get a small bonus that only upgrades give
//     (levelMult [0, 1, 2]: nothing at level 1, the value at level 2, twice it at level 3). Each key is one an existing
//     system already reads.
//   The Rest Spot and the props have no levels.
export const FACILITY_LEVELS = {
  max: 3,
  mult: [1, 1.5, 2],
  costMult: [0, 0.6, 0.9], // [level 1 (built), → level 2, → level 3] × the build price
  rankStep: [0, 1, 2],
  days: [0, 5, 10],
  RESEARCH_BUILD_RANK: 'C',
  SECRET_BUILD_RANK: 'A',
};
export const NO_SCALE = ['carBays', 'telemetry', 'reliabilityData', 'clueAfterEnding'];
export const NO_SCALE_PREFIX = ['unlock.', 'trainingSeats.'];
export const LEVEL_BONUS = {
  F02: [{ key: 'workPct.mechanic', value: 4 }], // Pit Bay: the crew works faster on the car
  F12: [{ key: 'setupKnowledge', value: 3 }], // Driver Simulator: drivers arrive knowing the setup
  F15: [{ key: 'revealReputation', value: 2 }], // Sponsor Wall: a better-shown reveal
  F21: [{ key: 'dev.EFF', value: 2 }], // Hybrid Lab
  F30: [{ key: 'workPct.mechanic', value: 3 }], // Prototype Bay
  F29: [{ key: 'revealReputation', value: 2 }], // Heritage Room (Milestone 27): the history on show
};

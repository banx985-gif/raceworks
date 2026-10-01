// RACEWORKS combos (Milestone 22, bible §17): the 20 synergies. Plain data only; src/systems/combos.js checks them.
// name / requirementText / rewardText are §17's cells exactly (tests/raceworks/m22.test.mjs reads the bible table and
// compares). Everything else here is how they're read — PLACEHOLDERS where the bible leaves a choice (docs/DECISIONS.md):
//
// requires: a list of atoms; the combo holds when every atom does (a near-miss = all but one, src/systems/combos.js):
//   { class: [ids] }        the car's class is one of these (data/cars.js CLASSES)
//   { part: 'PU01' }        that exact part is fitted
//   { partMin: 'PU05' }     a part of that slot at least that level ("PU05+": the same slot, complexity ≥ PU05's)
//   { setup: 'wet' }        the race weekend's setup is on Intermediate or Wet tyres (checked when the setup is set)
//   { crewTrait: { role, trait } }  someone of that role with that trait is on the team
//   { quality: n }          the finished car's QUALITY ≥ n (before any combo bonus)
//   { stat: ['REL', n] }    the finished car's stat ≥ n (before any combo bonus)
//   { titles: n }           this many visible championship titles (C01–C10)
//   { secret: 'SEC-CAR-04' } a Secret Engine flag — always false until it exists (debug override only)
// tier: basic / advanced / prestige → the first-discovery RP (bible §17: 10 / 25 / 100). PLACEHOLDER split.
// reward:
//   stats       added to the finished car's stats (through finalCar's development points, so the stat cap holds)
//   visual      the visual-family eligibility it unlocks (src/systems/carVisual.js)
//   wetStats    stats added in a race weekend with rain in its weather (Rain Runner)
//   knowledgePct  + this % on practice's Setup Knowledge (Data Car) · launchIncidentPct  STORED (no launch incidents yet)
//   clue        a clue flag (the Rumour Archive) · wetTraitXp  driver Wet trait XP (STORED on the driver's counters)
//   raceStats   all race stats + this (Project Zero)

// "Any sprint class" and "any top class" (the bible names no list). PLACEHOLDERS.
export const SPRINT_CLASSES = ['clubHatch', 'lightweight', 'touring', 'gt', 'formula', 'stock'];
export const TOP_CLASSES = ['endurance', 'prototype', 'electric', 'experimental'];
const ALL = null; // "Any": no class atom

export const COMBO_RP = { basic: 10, advanced: 25, prestige: 100 };

const c = (id, name, requirementText, rewardText, tier, requires, reward) => ({ id, name, requirementText, rewardText, tier, requires: requires.filter(Boolean), reward });
const cls = (...ids) => ({ class: ids });
const p = (id) => ({ part: id });
const pMin = (id) => ({ partMin: id });

export const COMBOS = [
  c('SYN01', 'Club Classic', 'Club Hatch + PU01 + TR01 + CH01', 'REL +10, EFF +8', 'basic', [cls('clubHatch'), p('PU01'), p('TR01'), p('CH01')], { stats: { REL: 10, EFF: 8 } }),
  c('SYN02', 'Featherweight', 'Lightweight + CH02 + AE01 + HB02', 'ACC +12, COR +12', 'basic', [cls('lightweight'), p('CH02'), p('AE01'), p('HB02')], { stats: { ACC: 12, COR: 12 } }),
  c('SYN03', 'Hot Hatch', 'Club Hatch/Touring + PU03 + TR03', 'ACC +16, unlock Hot Hatch visual eligibility', 'basic', [cls('clubHatch', 'touring'), p('PU03'), p('TR03')], { stats: { ACC: 16 }, visual: 'V05' }),
  c('SYN04', 'Street Knife', 'Lightweight/GT + AE05 + HB05 + EL07', 'COR +18, BRK +12', 'advanced', [cls('lightweight', 'gt'), p('AE05'), p('HB05'), p('EL07')], { stats: { COR: 18, BRK: 12 } }),
  c('SYN05', 'Touring Tank', 'Touring + CH03 + HB06', 'REL +18, TYR +14', 'basic', [cls('touring'), p('CH03'), p('HB06')], { stats: { REL: 18, TYR: 14 } }),
  c('SYN06', 'Rain Runner', 'Any + HB07 + EL04 + wet setup', 'COR +10 in wet, driver Wet trait XP +', 'advanced', [ALL, p('HB07'), p('EL04'), { setup: 'wet' }], { wetStats: { COR: 10 }, wetTraitXp: 25 }),
  c('SYN07', 'Sprint Rocket', 'Any sprint class + PU05 + TR05 + AE07', 'SPD +18, ACC +16, EFF -8', 'advanced', [{ class: SPRINT_CLASSES }, p('PU05'), p('TR05'), p('AE07')], { stats: { SPD: 18, ACC: 16, EFF: -8 } }),
  c('SYN08', 'Endurance Mule', 'Endurance + PU07 + TR06 + CH06 + HB06', 'REL +25, EFF +20', 'advanced', [cls('endurance'), p('PU07'), p('TR06'), p('CH06'), p('HB06')], { stats: { REL: 25, EFF: 20 } }),
  c('SYN09', 'Aero Grip', 'Formula/Prototype + AE06 + CH07', 'COR +25, TYR -6', 'advanced', [cls('formula', 'prototype'), p('AE06'), p('CH07')], { stats: { COR: 25, TYR: -6 } }),
  c('SYN10', 'Low Drag Bullet', 'GT/Formula + AE07 + TR07', 'SPD +25, unlock Titan Oval clue', 'advanced', [cls('gt', 'formula'), p('AE07'), p('TR07')], { stats: { SPD: 25 }, clue: 'titanOval' }),
  c('SYN11', 'Data Car', 'Any + EL04 + Race Engineer with Telemetry Eye', 'Setup knowledge +20%', 'basic', [ALL, p('EL04'), { crewTrait: { role: 'engineer', trait: 'telemetryEye' } }], { knowledgePct: 20 }),
  c('SYN12', 'Perfect Launch', 'Any + TR08 + EL05', 'ACC +28, launch incident chance -50%', 'advanced', [ALL, p('TR08'), p('EL05')], { stats: { ACC: 28 }, launchIncidentPct: -50 }),
  c('SYN13', 'Hybrid Long Game', 'GT/Endurance + PU07 + EL06', 'EFF +30, REL +12', 'advanced', [cls('gt', 'endurance'), p('PU07'), p('EL06')], { stats: { EFF: 30, REL: 12 } }),
  c('SYN14', 'Electric Phantom', 'Experimental + PU08 + EL06 + CH05', 'unlock Electric Phantom visual eligibility', 'prestige', [cls('experimental'), p('PU08'), p('EL06'), p('CH05')], { visual: 'electricPhantom' }),
  c('SYN15', 'Super Touring', 'Touring + PU05+ + CH05 + AE05 + HB07', 'unlock Super Touring visual eligibility', 'advanced', [cls('touring'), pMin('PU05'), p('CH05'), p('AE05'), p('HB07')], { visual: 'V13' }),
  c('SYN16', 'GT Pro', 'GT + PU06+ + AE05+ + EL07', 'unlock GT Pro visual eligibility', 'advanced', [cls('gt'), pMin('PU06'), pMin('AE05'), p('EL07')], { visual: 'V14' }),
  c('SYN17', 'Formula Pro', 'Formula + CH07 + AE06 + TR07 + QUALITY >= 88', 'unlock Formula Pro visual eligibility', 'prestige', [cls('formula'), p('CH07'), p('AE06'), p('TR07'), { quality: 88 }], { visual: 'V15' }),
  c('SYN18', 'Endurance Prototype', 'Prototype + PU07 + CH06 + EL06 + REL >= 220', 'unlock Endurance Prototype visual eligibility', 'prestige', [cls('prototype'), p('PU07'), p('CH06'), p('EL06'), { stat: ['REL', 220] }], { visual: 'V16' }),
  c('SYN19', 'World Spec', 'Any top class + QUALITY >= 94 + 3 visible titles', 'unlock World Champion visual eligibility', 'prestige', [{ class: TOP_CLASSES }, { quality: 94 }, { titles: 3 }], { visual: 'worldChampion' }),
  c('SYN20', 'Project Zero', 'Prestige conditions SEC-CAR-04', 'unlock Project Zero visual; all race stats +20', 'prestige', [{ secret: 'SEC-CAR-04' }], { visual: 'V20', raceStats: 20 }),
];
export const comboById = (id) => COMBOS.find((x) => x.id === id) ?? null;

// Clue words (a near-miss: every atom but one holds). "Something about this class and its transmission…"
export const CLUE_WORDS = {
  slot: { PU: 'its engine', TR: 'its transmission', CH: 'its chassis', AE: 'its aero', HB: 'its handling', EL: 'its electronics' },
  class: 'the right class',
  setup: 'how it is set up for the weather',
  crewTrait: 'who reads its data',
  quality: 'how well it is built',
  stat: 'how long it lasts',
  titles: 'a few more trophies',
  secret: 'something nobody talks about',
};

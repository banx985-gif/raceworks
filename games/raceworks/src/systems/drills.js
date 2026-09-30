// Driver drills: medals, Mastery, the training bonus and the account records (Milestone 14, bible §13.2–13.3).
//   medalFor(drill, score) → 'gold' | 'silver' | 'bronze' | null
//   bonusPct({ mode, medal, mastered }) — the rule, exactly:
//     Auto Train: +0%, or +12% when the course's drill is Mastered
//     Play Drill: Bronze +8% / Silver +16% / Gold +25%; a fail, quit, hand back or skip = the base gain (+0%)
//     Mastery never stacks with a manual result: a manual Gold is +25%, never +37%
//   createDrillRecords({ load, save }) — the account record (in the account save, never a slot: it survives New Game+,
//   slot deletes and reloads). Per drill: best score, medals earned (counts), goldEverEarned, mastered, attempts.
//   Plus competitiveSecretInvalidated: only a ?debug=1 forced result sets it — accessibility settings never do
//   (bible §25.7 / §43). The Secret Engine (M24) reads goldEverEarned and the flag; nothing uses them yet.
import { DRILLS, DRILL_BONUS, MEDALS, drillById, drillsForCourse } from '../../data/drills.js';

export function medalFor(drill, score) {
  const t = drill?.thresholds;
  if (!t || typeof score !== 'number') return null;
  return score >= t.gold ? 'gold' : score >= t.silver ? 'silver' : score >= t.bronze ? 'bronze' : null;
}

export function bonusPct({ mode = 'auto', medal = null, mastered = false } = {}) {
  if (mode === 'drill') return medal ? DRILL_BONUS[medal] : 0;
  return mastered ? DRILL_BONUS.masteredAuto : 0;
}

const blankDrill = () => ({ best: 0, medals: { bronze: 0, silver: 0, gold: 0 }, goldEverEarned: false, mastered: false, attempts: 0 });
export const blankRecords = () => ({ drills: Object.fromEntries(DRILLS.map((d) => [d.id, blankDrill()])), competitiveSecretInvalidated: false });

// load() → the stored block (or null); save(block) → Promise. Both optional (tests / no storage).
export function createDrillRecords({ load = async () => null, save = async () => {}, bus = null } = {}) {
  let data = blankRecords();
  const api = {
    get data() {
      return data;
    },
    of: (id) => data.drills[id] ?? (data.drills[id] = blankDrill()),
    mastered: (id) => !!data.drills[id]?.mastered,
    // Auto Train on this course earns the Mastery bonus when any of its drills is Mastered.
    courseMastered: (courseId) => drillsForCourse(courseId).some((d) => api.mastered(d.id)),
    get invalidated() {
      return data.competitiveSecretInvalidated;
    },
    // A finished (or abandoned) attempt. forced: a ?debug=1 override (sets competitiveSecretInvalidated).
    // → { medal, firstGold, newBest }
    record(drillId, { score = 0, finished = false } = {}, { forced = false } = {}) {
      const d = drillById(drillId);
      if (!d) return { medal: null, firstGold: false, newBest: false };
      const r = api.of(drillId);
      r.attempts++;
      const medal = finished ? medalFor(d, score) : null;
      const newBest = finished && score > r.best;
      if (newBest) r.best = score;
      if (medal) r.medals[medal]++;
      const firstGold = medal === 'gold' && !r.goldEverEarned;
      if (medal === 'gold') {
        r.goldEverEarned = true;
        r.mastered = true; // the first Gold ever masters the drill (§13.3)
      }
      if (forced) data.competitiveSecretInvalidated = true;
      api.save();
      bus?.emit('drill:recorded', { drillId, medal, firstGold, newBest, score });
      return { medal, firstGold, newBest };
    },
    reset() {
      data = blankRecords();
      return api.save();
    },
    async load() {
      const got = await load().catch(() => null);
      data = blankRecords();
      if (got?.drills) for (const [id, r] of Object.entries(got.drills)) data.drills[id] = { ...blankDrill(), ...r, medals: { ...blankDrill().medals, ...(r.medals ?? {}) } };
      data.competitiveSecretInvalidated = !!got?.competitiveSecretInvalidated;
      return data;
    },
    save: () => Promise.resolve(save(JSON.parse(JSON.stringify(data)))).catch(() => {}),
    medals: MEDALS,
  };
  return api;
}

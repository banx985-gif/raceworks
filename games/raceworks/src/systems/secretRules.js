// The rule validator (Milestone 24, bible §35.1 "machine-exact rule standard"). Every condition must resolve to an
// explicit fact id (data/secrets.js FACTS), a known operator and an explicit value: a number for a count or threshold,
// an id, a list of ids, or [lo, hi]. It rejects:
//   • free text in an executable place (a value or field with spaces, an unknown key on a condition);
//   • §35.1's forbidden wording (“available to that point”, “good enough”, “recently”, “month-equivalent”, “strong” /
//     “weak”, anything random) anywhere executable — fact names included (camelCase is split into words);
//   • a missing threshold (a count / comparison without a number), an unknown fact, operator, trigger or reward;
//   • a rule that could grant twice (no once-only scope matching its scope, a repeated reward action, a currency
//     reward without an amount);
//   • a rule that reads an accessibility setting (aids never decide a secret; only competitiveSecretInvalidated —
//     set by debug / forced results — may be read).
// Human-facing words (labels, clue texts, the recipe) may stay vague; the validator doesn't read them.
//   validateRules(rules) → [{ id, error }] (empty = all good) · validateRule(rule) → [error, …]
import { SECRET_OPS } from '../../../../core/SecretEngine.js';
import { FACTS, TRIGGERS, REWARD_TYPES, FORBIDDEN_WORDING, CLUE } from '../../data/secrets.js';

const FACT = Object.fromEntries(FACTS.map((f) => [f.id, f]));
const TRIGGER_IDS = new Set(TRIGGERS.map((t) => t.id));
const REWARD = Object.fromEntries(REWARD_TYPES.map((r) => [r.id, r]));
const COND_KEYS = new Set(['fact', 'op', 'value', 'where', 'field', 'cmp', 'label', 'kind', 'category', 'by', 'precision']);
const WHERE_KEYS = new Set(['field', 'op', 'value', 'kind']);
const NUMERIC = new Set(['gt', 'gte', 'lt', 'lte']);
const LIST_OPS = new Set(['countOf', 'consecutive', 'sameAcross']);
const ID = /^[A-Za-z0-9_.:+-]+$/;
const ACCESSIBILITY = /^(settings?|aids?|accessibility)\.|reducedMotion|reducedFlashes|lineHelp|brakeHelp|steering|textSize/i;

// "run.recentWins" → "run recent wins": so camelCase can't hide a forbidden word.
const words = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._:-]+/g, ' ');
const forbidden = (s) => FORBIDDEN_WORDING.find((re) => re.test(String(s)) || re.test(words(s)));

function checkValue(op, v, where) {
  if (NUMERIC.has(op) || LIST_OPS.has(op)) return Number.isFinite(v) ? null : `${where}: "${op}" needs a number (missing threshold)`;
  if (op === 'between') return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] <= v[1] ? null : `${where}: "between" needs [lo, hi]`;
  if (op === 'sequence') return Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && ID.test(x)) ? null : `${where}: "sequence" needs an ordered list of ids`;
  if (op === 'in') return Array.isArray(v) && v.length && v.every((x) => Number.isFinite(x) || typeof x === 'boolean' || (typeof x === 'string' && ID.test(x))) ? null : `${where}: "in" needs a list of ids`;
  if (v === undefined || v === null) return `${where}: no value`;
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${where}: not a finite number`;
  if (typeof v === 'boolean') return null;
  if (typeof v === 'string') return ID.test(v) ? null : `${where}: "${v}" is free text, not an id`;
  return `${where}: the value must be a number, a boolean or an id`;
}

function checkCond(c, path, errors) {
  if (!c || typeof c !== 'object') return errors.push(`${path}: not a condition`);
  if (c.all || c.any) {
    const list = c.all ?? c.any;
    if (!Array.isArray(list) || !list.length) errors.push(`${path}: an empty group`);
    else list.forEach((x, i) => checkCond(x, `${path}.${c.all ? 'all' : 'any'}[${i}]`, errors));
    return;
  }
  for (const k of Object.keys(c)) if (!COND_KEYS.has(k)) errors.push(`${path}: unknown key "${k}" (free text is not executable)`);
  const fact = FACT[c.fact];
  if (!fact) errors.push(`${path}: unknown fact "${c.fact}"`);
  if (ACCESSIBILITY.test(String(c.fact))) errors.push(`${path}: reads an accessibility setting (aids never decide a secret)`);
  if (!SECRET_OPS.includes(c.op)) errors.push(`${path}: unknown operator "${c.op}"`);
  for (const s of [c.fact, c.op, c.field, c.by, ...(typeof c.value === 'string' ? [c.value] : Array.isArray(c.value) ? c.value.filter((x) => typeof x === 'string') : [])].filter((x) => x != null)) {
    const bad = forbidden(s);
    if (bad) errors.push(`${path}: forbidden wording in "${s}" (§35.1 ${bad})`);
  }
  const vErr = checkValue(c.op, c.value, path);
  if (vErr) errors.push(vErr);
  if (LIST_OPS.has(c.op)) {
    if (fact && fact.type !== 'list') errors.push(`${path}: "${c.op}" needs a list fact`);
    if (c.op === 'sameAcross' && !(fact?.fields ?? []).includes(c.field)) errors.push(`${path}: "sameAcross" needs a list field of ${c.fact}`);
    if (c.op !== 'sameAcross' && !(c.where ?? []).length) errors.push(`${path}: "${c.op}" needs at least one where test`);
  }
  (c.where ?? []).forEach((w, i) => {
    const wp = `${path}.where[${i}]`;
    for (const k of Object.keys(w)) if (!WHERE_KEYS.has(k)) errors.push(`${wp}: unknown key "${k}"`);
    if (!(fact?.fields ?? []).includes(w.field)) errors.push(`${wp}: unknown field "${w.field}"`);
    if (!SECRET_OPS.includes(w.op)) errors.push(`${wp}: unknown operator "${w.op}"`);
    for (const s of [w.field, typeof w.value === 'string' ? w.value : null].filter(Boolean)) {
      const bad = forbidden(s);
      if (bad) errors.push(`${wp}: forbidden wording in "${s}" (§35.1 ${bad})`);
    }
    const e = checkValue(w.op, w.value, wp);
    if (e) errors.push(e);
  });
}

export function validateRule(r) {
  const errors = [];
  if (!r || typeof r.id !== 'string' || !ID.test(r.id)) return ['a rule needs an id'];
  if (!['run', 'account'].includes(r.scope)) errors.push('scope must be run or account');
  // once-only: exactly the flag that matches the scope (otherwise it could grant twice)
  if (r.scope === 'run' && !(r.oncePerRun && !r.oncePerAccount)) errors.push('a run rule must be oncePerRun (it could grant twice)');
  if (r.scope === 'account' && !r.oncePerAccount) errors.push('an account rule must be oncePerAccount (it could grant twice)');
  if (!Array.isArray(r.triggerEvents) || !r.triggerEvents.length) errors.push('no trigger events');
  for (const t of r.triggerEvents ?? []) if (!TRIGGER_IDS.has(t)) errors.push(`unknown trigger "${t}"`);
  if (r.ngPlusMin != null && !(Number.isInteger(r.ngPlusMin) && r.ngPlusMin >= 0)) errors.push('ngPlusMin must be a whole number ≥ 0');
  const conds = [...(r.requiresAll ?? []), ...(r.requiresAny ?? []), ...(r.forbids ?? [])];
  if (!conds.length) errors.push('no conditions');
  (r.requiresAll ?? []).forEach((c, i) => checkCond(c, `requiresAll[${i}]`, errors));
  (r.requiresAny ?? []).forEach((c, i) => checkCond(c, `requiresAny[${i}]`, errors));
  (r.forbids ?? []).forEach((c, i) => checkCond(c, `forbids[${i}]`, errors));
  for (const k of Object.keys(r)) if (/^(when|condition|requires|text|rule)$/i.test(k)) errors.push(`"${k}" looks like a free-text condition`);
  // clue stages 1–3 with rising shares, and the stage-4 recipe
  const cs = r.clueStages ?? [];
  if (cs.length !== CLUE.discovered - 1) errors.push(`needs ${CLUE.discovered - 1} clue stages (1–3)`);
  cs.forEach((s, i) => {
    const sh = s?.minMet?.share;
    if (!(typeof s?.text === 'string' && s.text) || !(sh > 0 && sh <= 1) || (i && !(sh > cs[i - 1]?.minMet?.share))) errors.push(`clue stage ${i + 1}: text and a rising share`);
  });
  if (!(typeof r.recipe === 'string' && r.recipe)) errors.push('no recipe (stage 4)');
  // rewards: known types, explicit ids, never the same action twice, currency with an amount
  const seen = new Set();
  for (const a of r.rewardActions ?? []) {
    if (!REWARD[a.type]) errors.push(`unknown reward "${a.type}"`);
    if (typeof a.id !== 'string' || !ID.test(a.id)) errors.push(`reward ${a.type}: needs an id`);
    const key = `${a.type}:${a.id}`;
    if (seen.has(key)) errors.push(`reward ${key} twice (it could grant twice)`);
    seen.add(key);
    if (REWARD[a.type]?.currency && !(Number.isFinite(a.amount) && a.amount > 0)) errors.push(`reward ${a.type}: needs an amount`);
  }
  if (!(r.rewardActions ?? []).length) errors.push('no reward actions');
  return errors;
}

export function validateRules(rules) {
  const out = [];
  const ids = new Set();
  for (const r of rules) {
    if (ids.has(r?.id)) out.push({ id: r.id, error: 'duplicate id' });
    ids.add(r?.id);
    for (const error of validateRule(r)) out.push({ id: r?.id ?? '?', error });
  }
  return out;
}

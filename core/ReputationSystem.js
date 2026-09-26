// Company reputation: one number that good work raises, with named ranks from game data.
// Reputation never drops below the floor of the highest rank already reached (see CompanyRank.js).
//   ranks: [{ id: 'E', min: 0 }, { id: 'D', min: 250 }, ...] (ascending)
// Emits 'reputation:change' ({ amount, reason, value, quiet }) and 'reputation:rankUp' ({ rank, index }).
import { rankIndexFor, rankFloor } from './CompanyRank.js';

export class ReputationSystem {
  constructor({ bus = null, ranks }) {
    this.bus = bus;
    this.ranks = ranks;
    this.value = 0;
    this.highestRankIndex = 0;
  }

  rankIndexFor(value) {
    return rankIndexFor(this.ranks, value);
  }

  get rank() {
    return this.ranks[this.rankIndexFor(this.value)];
  }

  get nextRank() {
    return this.ranks[this.rankIndexFor(this.value) + 1] || null;
  }

  // quiet: a small steady trickle (e.g. +1 a day) that screens should not announce each time.
  add(amount, reason = '', { quiet = false } = {}) {
    const delta = Math.round(amount);
    if (!delta) return;
    const floor = rankFloor(this.ranks, this.highestRankIndex);
    this.value = Math.max(floor, this.value + delta);
    this.bus?.emit('reputation:change', { amount: delta, reason, value: this.value, quiet });
    const idx = this.rankIndexFor(this.value);
    if (idx > this.highestRankIndex) {
      this.highestRankIndex = idx;
      this.bus?.emit('reputation:rankUp', { rank: this.ranks[idx], index: idx });
    }
  }

  serialize() {
    return { value: this.value, highestRankIndex: this.highestRankIndex };
  }

  load(s) {
    this.value = s?.value ?? 0;
    this.highestRankIndex = s?.highestRankIndex ?? 0;
  }
}

import type { Course, PlanItem, TermPlan, Track } from "@/lib/types";
import { RECOMMENDED_EDGES } from "@/lib/recommendedEdges";

const T1: Course["recommendedTerm"] = "Term 1";
const T2: Course["recommendedTerm"] = "Term 2";

const REQUIRED_CODES = ["STA5001", "STA5002"] as const;
const ELECTIVE_CORE_MIN = 1;
const ELECTIVE_BREADTH_MIN = 4;
const ELECTIVE_DEPTH_MIN = 2;
const MIN_TOTAL_COURSES = 10;
const EXCLUDED_FROM_PLANS = new Set(["STA5020", "STA5021", "STA5022"]); // capstone/internship not suggested in plans

type Bucket = {
  required: Course[];
  core: Course[];
  breadth: Course[];
  depth: Course[];
};

function uniqByCode(items: Course[]): Course[] {
  const seen = new Set<string>();
  const out: Course[] = [];
  for (const c of items) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    out.push(c);
  }
  return out;
}

function toItems(courses: Course[]): PlanItem[] {
  return courses.map((course) => ({ kind: "course", course }));
}

function countCourseType(items: PlanItem[], type: Course["type"]): number {
  return items.reduce((n, it) => (it.kind === "course" && it.course.type === type ? n + 1 : n), 0);
}

function countCourses(items: PlanItem[]): number {
  return items.reduce((n, it) => (it.kind === "course" ? n + 1 : n), 0);
}

function pickFirstExisting(codes: readonly string[], all: Course[]): Course | undefined {
  for (const code of codes) {
    const c = all.find((x) => x.code === code);
    if (c) return c;
  }
  return undefined;
}

export type PlanOptions = {
  track: Track;
};

function bucketCourses(courses: Course[]): Bucket {
  const filtered = courses.filter((c) => !EXCLUDED_FROM_PLANS.has(c.code));
  return {
    required: filtered.filter((c) => c.type === "Required"),
    core: filtered.filter((c) => c.type === "Elective-Core"),
    breadth: filtered.filter((c) => c.type === "Elective-Breath"),
    depth: filtered.filter((c) => c.type === "Elective-Depth"),
  };
}

function pickCoursesByCodes(all: Course[], codes: string[]): Course[] {
  const out: Course[] = [];
  for (const code of codes) {
    const c = all.find((x) => x.code === code);
    if (c) out.push(c);
  }
  return out;
}

function pickFromPool(pool: Course[], wanted: number, avoid: Set<string>): Course[] {
  const out: Course[] = [];
  for (const c of pool) {
    if (out.length >= wanted) break;
    if (avoid.has(c.code)) continue;
    out.push(c);
    avoid.add(c.code);
  }
  return out;
}

function sortStable(pool: Course[]): Course[] {
  return [...pool].sort((a, b) => a.code.localeCompare(b.code));
}

function capTermCourses(items: Course[], max: number): Course[] {
  if (items.length <= max) return items;
  const required = items.filter((c) => c.type === "Required");
  const core = items.filter((c) => c.type === "Elective-Core");
  const rest = items.filter((c) => c.type !== "Required" && c.type !== "Elective-Core");
  return [...required, ...core, ...rest].slice(0, max);
}

function buildSuggestedReverseAdj() {
  const rev = new Map<string, Set<string>>();
  for (const e of RECOMMENDED_EDGES) {
    if (!rev.has(e.to)) rev.set(e.to, new Set());
    rev.get(e.to)!.add(e.from);
  }
  return rev;
}

const suggestedRevAdj = buildSuggestedReverseAdj();

function suggestedPrereqs(code: string): string[] {
  return [...(suggestedRevAdj.get(code) ?? [])];
}

function suggestedClosure(code: string): string[] {
  const seen = new Set<string>();
  const stack = [code];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of suggestedPrereqs(cur)) {
      if (seen.has(p)) continue;
      seen.add(p);
      stack.push(p);
    }
  }
  return [...seen];
}

function isTheoryHeavyDepth(code: string): boolean {
  return code === "DDA5003" || code === "DDA6020" || code === "DDA6030";
}

function allowCourseForTrack(course: Course, track: Track): boolean {
  if (EXCLUDED_FROM_PLANS.has(course.code)) return false;
  // Keep theory-heavy depth courses mainly for the PhD/theory track.
  if (course.type === "Elective-Depth" && isTheoryHeavyDepth(course.code)) {
    return track.id === "phd_theory";
  }

  // Avoid recommending theory-adjacent electives to unrelated tracks as fillers.
  // (Otherwise the planner may create suggested-prep conflicts that it is not allowed to resolve.)
  const theoryAdjacent = new Set(["DDA5005"]); // suggested prep: DDA5003
  if (theoryAdjacent.has(course.code)) {
    return track.id === "phd_theory";
  }

  // Avoid recommending highly specialized domain electives to unrelated tracks
  // when we are just "filling" breadth/depth minimums.
  const biomedicalOnly = new Set(["MBI6005", "MBI6006"]);
  if (biomedicalOnly.has(course.code)) {
    return track.id === "biomedical";
  }

  const financeOnly = new Set(["MFE5150", "MFE5160", "MFE5190"]);
  if (financeOnly.has(course.code)) {
    return track.id === "finance";
  }

  // Avoid suggesting AI-specialized electives as "fillers" for the finance track.
  // Students interested in AI should pick the AI/ML track (or add via interests + advisor).
  const aiSpecialized = new Set(["MDS5122", "CSC5051", "AIR5066"]);
  if (aiSpecialized.has(course.code)) {
    return track.id === "ai_ml" || track.id === "biomedical" || track.id === "phd_theory";
  }

  return true;
}

type Buckets = {
  y1t1: Course[];
  y1t2: Course[];
  y2t1: Course[];
  y2t2: Course[];
};

function rebalanceWithinOfferingTerm(
  buckets: Buckets,
  allCourses: Course[],
  track: Track,
  maxPerTerm: number,
): Buckets {
  // Goal: if Term-1 or Term-2 Year-1 buckets are tight, move lower-priority items to Year 2
  // (same term) to make room for suggested-prep and keep plans consistent.
  const byCode = new Map(allCourses.map((c) => [c.code, c]));

  const focusSet = new Set(track.focusCourses);
  const suggestedSet = new Set<string>();
  for (const c of [...buckets.y1t1, ...buckets.y1t2, ...buckets.y2t1, ...buckets.y2t2]) {
    for (const p of suggestedClosure(c.code)) suggestedSet.add(p);
  }

  const priority = (c: Course): number => {
    if (c.type === "Required") return 1000;
    if (c.type === "Elective-Core") return 900;
    if (suggestedSet.has(c.code)) return 800;
    if (focusSet.has(c.code)) return 700;
    return 500;
  };

  const moveOne = (term: 1 | 2): boolean => {
    const src = term === 1 ? buckets.y1t1 : buckets.y1t2;
    const dst = term === 1 ? buckets.y2t1 : buckets.y2t2;
    if (src.length <= maxPerTerm) return false;
    if (dst.length >= maxPerTerm) return false;

    const candidates = src
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.type !== "Required" && c.type !== "Elective-Core")
      .sort((a, b) => priority(a.c) - priority(b.c)); // lowest priority moved first

    const pick = candidates[0];
    if (!pick) return false;
    const [item] = src.splice(pick.i, 1);
    dst.push(item);
    return true;
  };

  // First, enforce hard caps by moving overflow from Y1 -> Y2 in the same term.
  for (let i = 0; i < 20; i++) {
    const changed = moveOne(1) || moveOne(2);
    if (!changed) break;
  }

  // Second, if any suggested-prep is missing, try to bring it in by pushing low-priority courses to Year 2.
  const present = () =>
    new Set([...buckets.y1t1, ...buckets.y1t2, ...buckets.y2t1, ...buckets.y2t2].map((c) => c.code));

  for (let iter = 0; iter < 30; iter++) {
    const have = present();
    const selected = [...have];
    let added = false;
    for (const code of selected) {
      for (const p of suggestedClosure(code)) {
        if (have.has(p)) continue;
        const pc = byCode.get(p);
        if (!pc) continue;
        if (!allowCourseForTrack(pc, track)) continue;
        const term = pc.recommendedTerm === "Term 1" ? 1 : pc.recommendedTerm === "Term 2" ? 2 : null;
        if (!term) continue;

        const y1 = term === 1 ? buckets.y1t1 : buckets.y1t2;
        const y2 = term === 1 ? buckets.y2t1 : buckets.y2t2;

        if (y1.length >= maxPerTerm && y2.length < maxPerTerm) {
          // Move one low-priority course from Y1->Y2 to make room.
          moveOne(term);
        }
        if (y1.length < maxPerTerm) {
          y1.push(pc);
          added = true;
          break;
        }
        if (y2.length < maxPerTerm) {
          y2.push(pc);
          added = true;
          break;
        }
      }
      if (added) break;
    }
    if (!added) break;
  }

  // Stable ordering
  const sort = (list: Course[]) => list.sort((a, b) => a.code.localeCompare(b.code));
  sort(buckets.y1t1);
  sort(buckets.y1t2);
  sort(buckets.y2t1);
  sort(buckets.y2t2);
  return buckets;
}

function ensureSuggestedPrepIncluded(
  buckets: Buckets,
  allCourses: Course[],
  track: Track,
  maxPerTerm: number,
): { buckets: Buckets; missingSuggested: string[] } {
  const byCode = new Map(allCourses.map((c) => [c.code, c]));
  const present = new Set<string>(
    [...buckets.y1t1, ...buckets.y1t2, ...buckets.y2t1, ...buckets.y2t2].map((c) => c.code),
  );

  const mustKeep = new Set<string>([...REQUIRED_CODES]);
  for (const c of [...buckets.y1t1, ...buckets.y1t2, ...buckets.y2t1, ...buckets.y2t2]) {
    if (c.type === "Elective-Core") mustKeep.add(c.code);
  }

  const makeRoom = (list: Course[]) => {
    if (list.length < maxPerTerm) return true;
    // Drop a non-required, non-core filler if needed.
    const idx = [...list]
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !mustKeep.has(c.code))
      .sort((a, b) => {
        // Prefer dropping breadth first, then depth; keep focus-ish courses if possible.
        const wa = a.c.type === "Elective-Breath" ? 0 : 1;
        const wb = b.c.type === "Elective-Breath" ? 0 : 1;
        if (wa !== wb) return wb - wa;
        return b.c.code.localeCompare(a.c.code);
      })[0]?.i;
    if (idx === undefined) return false;
    list.splice(idx, 1);
    return true;
  };

  const addToTerm = (course: Course, term: 1 | 2) => {
    // Prefer earlier year.
    const primary = term === 1 ? buckets.y1t1 : buckets.y1t2;
    const secondary = term === 1 ? buckets.y2t1 : buckets.y2t2;
    if (primary.some((c) => c.code === course.code) || secondary.some((c) => c.code === course.code)) return true;

    if (makeRoom(primary)) {
      primary.push(course);
      return true;
    }
    if (makeRoom(secondary)) {
      secondary.push(course);
      return true;
    }
    return false;
  };

  const missingSuggested: string[] = [];

  // For every selected course, ensure its suggested-prereq closure exists in the plan.
  const selected = [...present];
  for (const code of selected) {
    const prereqs = suggestedClosure(code);
    for (const p of prereqs) {
      if (present.has(p)) continue;
      const pc = byCode.get(p);
      if (!pc) continue;
      if (!allowCourseForTrack(pc, track)) continue;
      const term = pc.recommendedTerm === "Term 1" ? 1 : pc.recommendedTerm === "Term 2" ? 2 : null;
      if (!term) continue;
      const ok = addToTerm(pc, term);
      if (ok) {
        present.add(pc.code);
      } else {
        missingSuggested.push(pc.code);
      }
    }
  }

  return { buckets, missingSuggested: [...new Set(missingSuggested)].sort() };
}

function enforceSuggestedOrdering(b: Buckets, maxPerTerm: number): Buckets {
  // Rule:
  // - Avoid placing a course in the same semester as its suggested prerequisites.
  // - If both are selected and have the same offering term (e.g., Term 2), prefer prereq in Year 1 and course in Year 2.
  const term1 = [b.y1t1, b.y2t1];
  const term2 = [b.y1t2, b.y2t2];

  const byCode = new Map<string, { list: Course[]; term: 1 | 2; yearIdx: 0 | 1 }>();
  const index = () => {
    byCode.clear();
    for (const [yearIdx, list] of term1.entries()) {
      for (const c of list) byCode.set(c.code, { list, term: 1, yearIdx: yearIdx as 0 | 1 });
    }
    for (const [yearIdx, list] of term2.entries()) {
      for (const c of list) byCode.set(c.code, { list, term: 2, yearIdx: yearIdx as 0 | 1 });
    }
  };
  index();

  const move = (code: string, targetTerm: 1 | 2, targetYearIdx: 0 | 1): boolean => {
    const cur = byCode.get(code);
    if (!cur) return false;
    if (cur.term !== targetTerm) return false; // offering-term constraint
    if (cur.yearIdx === targetYearIdx) return false;

    const src = cur.list;
    const dst = targetTerm === 1 ? term1[targetYearIdx] : term2[targetYearIdx];
    if (dst.length >= maxPerTerm) return false;

    const i = src.findIndex((c) => c.code === code);
    if (i === -1) return false;
    const [item] = src.splice(i, 1);
    dst.push(item);
    index();
    return true;
  };

  const removeFrom = (list: Course[], code: string) => {
    const i = list.findIndex((c) => c.code === code);
    if (i !== -1) list.splice(i, 1);
  };

  // Iterate a few times to resolve chains.
  for (let iter = 0; iter < 6; iter++) {
    let changed = false;
    index();

    for (const [code, loc] of byCode.entries()) {
      const prereqs = suggestedPrereqs(code).filter((p) => byCode.has(p));
      for (const p of prereqs) {
        const ploc = byCode.get(p)!;
        // If in the same semester bucket, attempt to separate them.
        if (ploc.term === loc.term && ploc.yearIdx === loc.yearIdx) {
          // Prefer moving the dependent course later (Year 2) if possible.
          if (loc.term === 2 && loc.yearIdx === 0) {
            changed = move(code, 2, 1) || changed;
          } else if (loc.term === 1 && loc.yearIdx === 0) {
            changed = move(code, 1, 1) || changed;
          } else {
            // If already in Year 2, try moving the prereq earlier.
            if (ploc.term === 2 && ploc.yearIdx === 1) changed = move(p, 2, 0) || changed;
            if (ploc.term === 1 && ploc.yearIdx === 1) changed = move(p, 1, 0) || changed;
          }
        }

        // If prereq ends up in a later year than the course for the same offering term, swap direction.
        // (e.g., course in Y1T2 while its suggested prereq is in Y2T2).
        const loc2 = byCode.get(code);
        const ploc2 = byCode.get(p);
        if (!loc2 || !ploc2) continue;
        if (loc2.term === ploc2.term && ploc2.yearIdx > loc2.yearIdx) {
          // Try move course later; if cannot, move prereq earlier.
          if (loc2.term === 2) {
            changed = move(code, 2, 1) || changed;
            if (!changed) changed = move(p, 2, 0) || changed;
          } else {
            changed = move(code, 1, 1) || changed;
            if (!changed) changed = move(p, 1, 0) || changed;
          }
        }
      }
    }

    if (!changed) break;
  }

  // Keep output stable-ish.
  const sort = (list: Course[]) => list.sort((a, b) => a.code.localeCompare(b.code));
  sort(b.y1t1);
  sort(b.y1t2);
  sort(b.y2t1);
  sort(b.y2t2);
  return b;
}

function enforceGlobalSuggestedOrdering(b: Buckets, maxPerTerm: number): Buckets {
  // Stronger rule than "not in the same semester":
  // If a suggested-prep course is scheduled AFTER the dependent course in the 2-year timeline,
  // try to fix it by moving the dependent course later within its offering term year (Y1->Y2),
  // otherwise move the prereq earlier (Y2->Y1).
  const loc = new Map<string, { term: 1 | 2; year: 1 | 2; list: Course[] }>();
  const index = () => {
    loc.clear();
    for (const c of b.y1t1) loc.set(c.code, { term: 1, year: 1, list: b.y1t1 });
    for (const c of b.y1t2) loc.set(c.code, { term: 2, year: 1, list: b.y1t2 });
    for (const c of b.y2t1) loc.set(c.code, { term: 1, year: 2, list: b.y2t1 });
    for (const c of b.y2t2) loc.set(c.code, { term: 2, year: 2, list: b.y2t2 });
  };
  const timeIdx = (year: 1 | 2, term: 1 | 2) => (year - 1) * 2 + (term - 1); // 0..3

  const makeRoom = (list: Course[]) => {
    if (list.length < maxPerTerm) return true;
    // Drop a non-required, non-core filler if needed.
    const idx = [...list]
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.type !== "Required" && c.type !== "Elective-Core")
      .sort((a, z) => a.c.code.localeCompare(z.c.code))[0]?.i;
    if (idx === undefined) return false;
    list.splice(idx, 1);
    return true;
  };

  const moveWithinTermYear = (code: string, toYear: 1 | 2): boolean => {
    const cur = loc.get(code);
    if (!cur) return false;
    if (cur.year === toYear) return false;
    const src = cur.list;
    const dst = cur.term === 1 ? (toYear === 1 ? b.y1t1 : b.y2t1) : toYear === 1 ? b.y1t2 : b.y2t2;
    if (!makeRoom(dst)) return false;
    const idx = src.findIndex((c) => c.code === code);
    if (idx === -1) return false;
    const [item] = src.splice(idx, 1);
    dst.push(item);
    index();
    return true;
  };

  index();
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const e of RECOMMENDED_EDGES) {
      const p = loc.get(e.from);
      const c = loc.get(e.to);
      if (!p || !c) continue;
      const pIdx = timeIdx(p.year, p.term);
      const cIdx = timeIdx(c.year, c.term);
      if (pIdx < cIdx) continue;

      // Prefer moving dependent later (Y1->Y2) within its offering term.
      if (c.year === 1) {
        changed = moveWithinTermYear(e.to, 2) || changed;
      } else if (p.year === 2) {
        // Otherwise, try moving prereq earlier (Y2->Y1) within its offering term.
        changed = moveWithinTermYear(e.from, 1) || changed;
      }
    }
    if (!changed) break;
  }

  const sort = (list: Course[]) => list.sort((a, b) => a.code.localeCompare(b.code));
  sort(b.y1t1);
  sort(b.y1t2);
  sort(b.y2t1);
  sort(b.y2t2);
  return b;
}

function applyYearPreferences(b: Buckets, track: Track, maxPerTerm: number): Buckets {
  // Some courses make more sense later even if offered in the same term each year.
  // We only move within the same offering term (Term 1: Y1T1 <-> Y2T1, Term 2: Y1T2 <-> Y2T2).
  const makeRoom = (list: Course[]) => {
    if (list.length < maxPerTerm) return true;
    // Drop a non-required, non-core filler if needed.
    const idx = [...list]
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.type !== "Required" && c.type !== "Elective-Core")
      .sort((a, b) => {
        const wa = a.c.type === "Elective-Breath" ? 0 : 1;
        const wb = b.c.type === "Elective-Breath" ? 0 : 1;
        if (wa !== wb) return wb - wa;
        return b.c.code.localeCompare(a.c.code);
      })[0]?.i;
    if (idx === undefined) return false;
    list.splice(idx, 1);
    return true;
  };

  const ensureInBucket = (code: string, term: 1 | 2, year: 1 | 2): boolean => {
    const lists =
      term === 1
        ? { y1: b.y1t1, y2: b.y2t1 }
        : { y1: b.y1t2, y2: b.y2t2 };
    const dst = year === 1 ? lists.y1 : lists.y2;
    const src = year === 1 ? lists.y2 : lists.y1;
    if (dst.some((c) => c.code === code)) return true;
    const inSrcIdx = src.findIndex((c) => c.code === code);
    if (inSrcIdx !== -1) {
      if (!makeRoom(dst)) return false;
      const [item] = src.splice(inSrcIdx, 1);
      dst.push(item);
      return true;
    }
    return false;
  };

  const moveWithinTerm = (code: string, term: 1 | 2, toYear: 1 | 2): boolean => {
    const src = term === 1 ? (toYear === 1 ? b.y2t1 : b.y1t1) : toYear === 1 ? b.y2t2 : b.y1t2;
    const dst = term === 1 ? (toYear === 1 ? b.y1t1 : b.y2t1) : toYear === 1 ? b.y1t2 : b.y2t2;
    if (dst.length >= maxPerTerm) return false;
    const idx = src.findIndex((c) => c.code === code);
    if (idx === -1) return false;
    const [item] = src.splice(idx, 1);
    dst.push(item);
    return true;
  };

  if (track.id === "biomedical") {
    // Prefer MBI6005 later (Y2T1) so students can build ML foundations first,
    // then do biomedical stats -> biomedical ML across Year 2.
    moveWithinTerm("MBI6005", 1, 2);
    moveWithinTerm("MBI6006", 2, 2);

    // If MBI6006 is included, aggressively keep its suggested preparation courses earlier
    // (otherwise students see an advanced course without the prep in the plan).
    const hasMBI6006 = b.y1t2.some((c) => c.code === "MBI6006") || b.y2t2.some((c) => c.code === "MBI6006");
    if (hasMBI6006) {
      ensureInBucket("MBI6005", 1, 2); // Y2T1
      ensureInBucket("DDA5001", 2, 1); // Y1T2 (ML before biomedical ML)
      ensureInBucket("DDA5002", 1, 1); // Y1T1 (optimization before ML)
      ensureInBucket("MDS5111", 1, 1); // Y1T1 (Python before ML)
    }
  }

  // Keep output stable-ish.
  const sort = (list: Course[]) => list.sort((a, b) => a.code.localeCompare(b.code));
  sort(b.y1t1);
  sort(b.y1t2);
  sort(b.y2t1);
  sort(b.y2t2);
  return b;
}

function toTermPlans(t: {
  y1t1: Course[];
  y1t2: Course[];
  y2t1: Course[];
  y2t2: Course[];
}): TermPlan[] {
  return [
    { year: 1, term: 1, items: toItems(uniqByCode(t.y1t1)) },
    { year: 1, term: 2, items: toItems(uniqByCode(t.y1t2)) },
    { year: 2, term: 1, items: toItems(uniqByCode(t.y2t1)) },
    { year: 2, term: 2, items: toItems(uniqByCode(t.y2t2)) },
  ];
}

export function generateDefaultPlan(courses: Course[], opts: PlanOptions): TermPlan[] {
  const b = bucketCourses(courses);
  const avoid = new Set<string>();

  const required = REQUIRED_CODES.map((code) => b.required.find((c) => c.code === code)).filter(
    (x): x is Course => Boolean(x),
  );
  for (const c of required) avoid.add(c.code);

  const electiveCore = pickFirstExisting(opts.track.preferredElectiveCore, b.core);
  if (electiveCore) avoid.add(electiveCore.code);

  // Prefer taking slightly more courses in Year 1, but keep a sensible per-term load.
  // (We still respect the "Term 1 / Term 2" offering labels.)
  const y1t1Seed: Course[] = [
    ...required,
    ...(electiveCore ? [electiveCore] : []),
  ].filter((c) => c.recommendedTerm === T1);

  // Enablers that increase feasible elective choices (only add if there's room).
  const enablerPoolT1 = sortStable(
    pickCoursesByCodes(courses, ["MDS5111", "DDA5002", "MDS5117"]).filter(
      (c) => c.recommendedTerm === T1 && !avoid.has(c.code),
    ),
  );

  const focus = opts.track.focusCourses
    .map((code) => courses.find((c) => c.code === code))
    .filter((x): x is Course => Boolean(x))
    .filter((c) => allowCourseForTrack(c, opts.track));

  // If we include an advanced course, try to include its suggested prep courses too.
  const focusPlusPrepCodes = new Set<string>();
  for (const c of focus) {
    focusPlusPrepCodes.add(c.code);
    for (const p of suggestedClosure(c.code)) focusPlusPrepCodes.add(p);
  }
  const focusPlusPrep = [...focusPlusPrepCodes]
    .map((code) => courses.find((c) => c.code === code))
    .filter((x): x is Course => Boolean(x))
    .filter((c) => allowCourseForTrack(c, opts.track));

  const y1t2Seed: Course[] = [...focus.filter((c) => c.recommendedTerm === T2)];
  const prepT1Seed: Course[] = focusPlusPrep.filter((c) => c.recommendedTerm === T1);
  const prepT2Seed: Course[] = focusPlusPrep.filter((c) => c.recommendedTerm === T2);

  const y1t1 = uniqByCode([...y1t1Seed, ...prepT1Seed]);
  const y1t2 = uniqByCode([...y1t2Seed, ...prepT2Seed]);
  const y2t1: Course[] = [];
  const y2t2: Course[] = [];

  const already = new Set([...y1t1, ...y1t2].map((c) => c.code));
  for (const code of already) avoid.add(code);

  // Graduation constraints (minimums). We fill by type, while respecting offering term.
  // Strategy: finish most of the minima in Year 1; leave a lighter Year 2.
  const corePicked = electiveCore ? 1 : 0;
  const breadthPicked = [...y1t1, ...y1t2].filter((c) => c.type === "Elective-Breath").length;
  const depthPicked = [...y1t1, ...y1t2].filter((c) => c.type === "Elective-Depth").length;

  const coreNeed = Math.max(0, ELECTIVE_CORE_MIN - corePicked);
  const breadthNeed = Math.max(0, ELECTIVE_BREADTH_MIN - breadthPicked);
  const depthNeed = Math.max(0, ELECTIVE_DEPTH_MIN - depthPicked);

  // If core isn't picked yet (should be rare), choose any available core in Term 1.
  if (coreNeed > 0) {
    const candidates = sortStable(b.core).filter((c) => c.recommendedTerm === T1 && !avoid.has(c.code));
    const picked = pickFromPool(candidates, coreNeed, avoid);
    y1t1.push(...picked);
  }

  const breadthT1 = sortStable(b.breadth)
    .filter((c) => allowCourseForTrack(c, opts.track))
    .filter((c) => c.recommendedTerm === T1 && !avoid.has(c.code));
  const breadthT2 = sortStable(b.breadth)
    .filter((c) => allowCourseForTrack(c, opts.track))
    .filter((c) => c.recommendedTerm === T2 && !avoid.has(c.code));
  const depthT1 = sortStable(b.depth)
    .filter((c) => allowCourseForTrack(c, opts.track))
    .filter((c) => c.recommendedTerm === T1 && !avoid.has(c.code));
  const depthT2 = sortStable(b.depth)
    .filter((c) => allowCourseForTrack(c, opts.track))
    .filter((c) => c.recommendedTerm === T2 && !avoid.has(c.code));

  // Hard constraint: never exceed 5 courses in a term.
  // Soft constraint: usually aim for 4 courses (especially in Year 1).
  const MAX_PER_TERM = 5;
  const Y1T1_TARGET = 4;
  const Y1T2_TARGET = 4;
  const Y2T1_TARGET = 3;
  const Y2T2_TARGET = 2;

  // Add at most 1 enabler in Term 1 in most cases (since required+core already fill 3 slots).
  y1t1.push(
    ...pickFromPool(
      enablerPoolT1,
      Math.max(0, Math.min(1, Math.min(MAX_PER_TERM, Y1T1_TARGET) - y1t1.length)),
      avoid,
    ),
  );

  // Fill Year 1 to satisfy most minima.
  const breadthToAddY1 = Math.min(breadthNeed, 4);
  const depthToAddY1 = Math.min(depthNeed, 2);

  y1t1.push(
    ...pickFromPool(
      breadthT1,
      Math.max(0, Math.min(breadthToAddY1, Math.min(MAX_PER_TERM, Y1T1_TARGET) - y1t1.length)),
      avoid,
    ),
  );
  y1t2.push(
    ...pickFromPool(
      breadthT2,
      Math.max(
        0,
        Math.min(
          breadthToAddY1 - (y1t1.filter((c) => c.type === "Elective-Breath").length - breadthPicked),
          Math.min(MAX_PER_TERM, Y1T2_TARGET) - y1t2.length,
        ),
      ),
      avoid,
    ),
  );
  y1t2.push(
    ...pickFromPool(
      depthT2,
      Math.max(0, Math.min(depthToAddY1, Math.min(MAX_PER_TERM, Y1T2_TARGET) - y1t2.length)),
      avoid,
    ),
  );

  // Top up Year 1 to targets using track focus courses that match the term.
  const focusT1 = sortStable(focusPlusPrep).filter((c) => c.recommendedTerm === T1 && !avoid.has(c.code));
  const focusT2 = sortStable(focusPlusPrep).filter((c) => c.recommendedTerm === T2 && !avoid.has(c.code));
  y1t1.push(
    ...pickFromPool(focusT1, Math.max(0, Math.min(MAX_PER_TERM, Y1T1_TARGET) - y1t1.length), avoid),
  );
  y1t2.push(
    ...pickFromPool(focusT2, Math.max(0, Math.min(MAX_PER_TERM, Y1T2_TARGET) - y1t2.length), avoid),
  );

  // Year 2: finish any remaining minima, but keep it light.
  const breadthPicked2 = [...y1t1, ...y1t2].filter((c) => c.type === "Elective-Breath").length;
  const depthPicked2 = [...y1t1, ...y1t2].filter((c) => c.type === "Elective-Depth").length;
  const breadthNeed2 = Math.max(0, ELECTIVE_BREADTH_MIN - breadthPicked2);
  const depthNeed2 = Math.max(0, ELECTIVE_DEPTH_MIN - depthPicked2);

  y2t1.push(
    ...pickFromPool(
      breadthT1,
      Math.min(breadthNeed2, Math.min(MAX_PER_TERM, Y2T1_TARGET) - y2t1.length),
      avoid,
    ),
  );
  y2t2.push(
    ...pickFromPool(
      breadthT2,
      Math.min(
        Math.max(0, breadthNeed2 - y2t1.length),
        Math.min(MAX_PER_TERM, Y2T2_TARGET) - y2t2.length,
      ),
      avoid,
    ),
  );
  y2t2.push(
    ...pickFromPool(
      depthT2,
      Math.min(depthNeed2, Math.min(MAX_PER_TERM, Y2T2_TARGET) - y2t2.length),
      avoid,
    ),
  );

  // Ensure required courses are in Year 1 Term 1.
  for (const c of required) {
    if (!y1t1.some((x) => x.code === c.code)) y1t1.unshift(c);
  }

  // Final guardrail: never exceed 5 courses per term (preserve required/core first).
  const trim = (arr: Course[]) => capTermCourses(arr, MAX_PER_TERM);
  const preBuckets: Buckets = { y1t1: trim(y1t1), y1t2: trim(y1t2), y2t1: trim(y2t1), y2t2: trim(y2t2) };
  // Rebalance across years (same offering term) to make room for suggested preparation.
  const rebalanced = rebalanceWithinOfferingTerm(preBuckets, courses, opts.track, MAX_PER_TERM);
  const withPrep = ensureSuggestedPrepIncluded(rebalanced, courses, opts.track, MAX_PER_TERM);
  const buckets = enforceSuggestedOrdering(withPrep.buckets, MAX_PER_TERM);
  const buckets2 = applyYearPreferences(buckets, opts.track, MAX_PER_TERM);
  const buckets3 = enforceGlobalSuggestedOrdering(buckets2, MAX_PER_TERM);
  const plans = toTermPlans(buckets3);

  // Ensure graduation minima are satisfied; if we can't pick specific courses (due to load cap),
  // we add placeholders to make requirements explicit.
  const allItems = plans.flatMap((p) => p.items);
  const reqCore = Math.max(0, ELECTIVE_CORE_MIN - countCourseType(allItems, "Elective-Core"));
  const reqBreath = Math.max(0, ELECTIVE_BREADTH_MIN - countCourseType(allItems, "Elective-Breath"));
  const reqDepth = Math.max(0, ELECTIVE_DEPTH_MIN - countCourseType(allItems, "Elective-Depth"));

  const placeholders: PlanItem[] = [];
  if (reqCore > 0) placeholders.push({ kind: "placeholder", label: `${reqCore} Elective-Core`, type: "Elective-Core" });
  if (reqBreath > 0)
    placeholders.push({ kind: "placeholder", label: `${reqBreath} Elective-Breath`, type: "Elective-Breath" });
  if (reqDepth > 0)
    placeholders.push({ kind: "placeholder", label: `${reqDepth} Elective-Depth`, type: "Elective-Depth" });

  const totalCourses = countCourses(allItems);
  const missingTotal = Math.max(0, MIN_TOTAL_COURSES - totalCourses);
  if (missingTotal > 0) {
    placeholders.push({
      kind: "placeholder",
      label: `${missingTotal} additional elective(s)`,
      type: "Elective-Breath",
    });
  }

  if (withPrep.missingSuggested.length) {
    placeholders.push({
      kind: "placeholder",
      label: `Suggested prep not scheduled (due to term caps): ${withPrep.missingSuggested.join(", ")}`,
      type: "Elective-Breath",
    });
  }

  if (!placeholders.length) return plans;

  // Place placeholders where they communicate requirements without overloading Year 2.
  // Preference: if Year 2 already has >= Year 1 course load, put placeholders in Year 1
  // (students are usually busier in Year 2). Otherwise, place them in the lightest term.
  const year1Courses =
    countCourses(plans[0].items) + countCourses(plans[1].items);
  const year2Courses =
    countCourses(plans[2].items) + countCourses(plans[3].items);

  const termCourseCounts = plans.map((p) => ({
    plan: p,
    n: countCourses(p.items),
  }));

  const pickLightest = (cands: typeof termCourseCounts) =>
    [...cands].sort((a, b) => a.n - b.n)[0]?.plan ?? plans[plans.length - 1];

  const target =
    year2Courses >= year1Courses
      ? pickLightest(termCourseCounts.filter((x) => x.plan.year === 1))
      : pickLightest(termCourseCounts);

  target.items.push(...placeholders);
  return plans;
}


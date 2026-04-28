import prereqTextJson from "@/data/prereq_text.json";
import type { Course } from "@/lib/types";
import { RECOMMENDED_EDGES } from "@/lib/recommendedEdges";

export type Paths = {
  officialPrereqText: string;
  officialPrereqCodes: string[];
  suggestedPrepCodes: string[];
};

function uniqSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function buildRecommendedReverseAdj() {
  const rev = new Map<string, Set<string>>();
  for (const e of RECOMMENDED_EDGES) {
    if (!rev.has(e.to)) rev.set(e.to, new Set());
    rev.get(e.to)!.add(e.from);
  }
  return rev;
}

const recommendedRev = buildRecommendedReverseAdj();

function recommendedClosure(target: string): string[] {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    const ps = recommendedRev.get(cur);
    if (!ps) continue;
    for (const p of ps) {
      if (seen.has(p)) continue;
      seen.add(p);
      stack.push(p);
    }
  }
  return [...seen];
}

function parseOfficialCodes(raw: string, allCodes: Set<string>, self: string): string[] {
  if (!raw || !raw.trim()) return [];
  const found: string[] = [];
  for (const code of allCodes) {
    if (code === self) continue;
    if (raw.includes(code)) found.push(code);
  }
  return uniqSorted(found);
}

export function getPathsForCourse(code: string, courses: Course[]): Paths {
  const prereqTextMap = prereqTextJson as Record<string, string | undefined>;
  const raw = (prereqTextMap[code] ?? "").trim();
  const allCodes = new Set(courses.map((c) => c.code));

  const officialPrereqCodes = parseOfficialCodes(raw, allCodes, code);

  // Suggested: our recommended learning path closure, excluding any official prereqs to avoid duplication.
  const suggested = recommendedClosure(code).filter((c) => allCodes.has(c) && c !== code);
  const suggestedPrepCodes = uniqSorted(suggested.filter((c) => !officialPrereqCodes.includes(c)));

  return {
    officialPrereqText: raw,
    officialPrereqCodes,
    suggestedPrepCodes,
  };
}


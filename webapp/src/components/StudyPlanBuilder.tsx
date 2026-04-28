"use client";

import { useMemo, useState } from "react";
import type { Course, PlanItem, TrackId } from "@/lib/types";
import { TRACKS } from "@/lib/tracks";
import { generateDefaultPlan } from "@/lib/plan";
import { RECOMMENDED_EDGES } from "@/lib/recommendedEdges";

type Props = {
  courses: Course[];
};

export function StudyPlanBuilder({ courses }: Props) {
  const [trackId, setTrackId] = useState<TrackId>("ai_ml");
  const [interestText, setInterestText] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [llmSuggestion, setLlmSuggestion] = useState<string>("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string>("");

  const track = useMemo(() => TRACKS.find((t) => t.id === trackId)!, [trackId]);
  const plan = useMemo(
    () =>
      generateDefaultPlan(courses, {
        track,
      }),
    [courses, track],
  );

  const totals = useMemo(() => {
    const all = plan.flatMap((p) => p.items);
    const countKind = (kind: PlanItem["kind"]) => all.filter((i) => i.kind === kind).length;
    const countType = (type: Course["type"]) =>
      all.filter((i) => i.kind === "course" && i.course.type === type).length;

    return {
      totalCourses: countKind("course"),
      required: countType("Required"),
      core: countType("Elective-Core"),
      breath: countType("Elective-Breath"),
      depth: countType("Elective-Depth"),
    };
  }, [plan]);

  const missingSuggested = useMemo(() => {
    // Validate: for each course in plan, are its suggested-prereq courses also in the plan?
    const all = plan.flatMap((p) => p.items).filter((i) => i.kind === "course") as Array<{
      kind: "course";
      course: Course;
    }>;
    const present = new Set(all.map((i) => i.course.code));
    const missingPairs: Array<{ course: string; missing: string[] }> = [];

    const rev = new Map<string, Set<string>>();
    for (const e of RECOMMENDED_EDGES) {
      if (!rev.has(e.to)) rev.set(e.to, new Set());
      rev.get(e.to)!.add(e.from);
    }

    for (const it of all) {
      const prereqs = [...(rev.get(it.course.code) ?? [])].filter((c) => !present.has(c));
      if (prereqs.length) missingPairs.push({ course: it.course.code, missing: prereqs.sort() });
    }
    return missingPairs;
  }, [plan]);

  async function getLlmSuggestion() {
    setLlmError("");
    setLlmSuggestion("");

    if (!apiKey.trim()) {
      setLlmError("No API key provided. Using default track-based plan only.");
      return;
    }

    setLlmLoading(true);
    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-llm-api-key": apiKey.trim(),
        },
        body: JSON.stringify({
          interests: interestText,
          track: track.name,
          plan,
          courses,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as { suggestion: string };
      setLlmSuggestion(data.suggestion);
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "LLM request failed.");
    } finally {
      setLlmLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <div className="text-sm font-semibold text-zinc-900">Interest / Track</div>
            <div className="mt-2 flex flex-col gap-3 md:flex-row">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-black">Track (no API key needed)</span>
                <select
                  className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm text-black"
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value as TrackId)}
                >
                  {TRACKS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-black">Interests (optional, for LLM)</span>
                <input
                  className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm text-black placeholder:text-zinc-500"
                  value={interestText}
                  onChange={(e) => setInterestText(e.target.value)}
                  placeholder="e.g. NLP, finance risk, biomedical imaging…"
                />
              </label>
            </div>
            <div className="mt-2 text-xs text-zinc-600">{track.description}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-700">
          <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-1">
            Total courses: <span className="font-semibold text-zinc-900">{totals.totalCourses}</span>
          </span>
          <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-1">
            Required: <span className="font-semibold text-zinc-900">{totals.required}</span>
          </span>
          <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-1">
            Elective-Core: <span className="font-semibold text-zinc-900">{totals.core}</span>
          </span>
          <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-1">
            Elective-Breath: <span className="font-semibold text-zinc-900">{totals.breath}</span>
          </span>
          <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-1">
            Elective-Depth: <span className="font-semibold text-zinc-900">{totals.depth}</span>
          </span>
        </div>
        {missingSuggested.length ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Note</div>
            <div className="mt-1">
              Some courses have suggested preparation courses that are not currently in the plan (due to term caps or
              track filtering):
            </div>
            <ul className="mt-2 list-disc pl-5">
              {missingSuggested.slice(0, 6).map((m) => (
                <li key={m.course}>
                  <span className="font-semibold">{m.course}</span>: {m.missing.join(", ")}
                </li>
              ))}
              {missingSuggested.length > 6 ? <li>…and {missingSuggested.length - 6} more</li> : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plan.map((tp) => (
          <div
            key={`${tp.year}-${tp.term}`}
            className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
          >
            <div className="flex items-baseline justify-between">
              <div className="text-base font-semibold text-zinc-900">
                Year {tp.year} Term {tp.term}{" "}
                <span className="text-xs font-normal text-zinc-600">
                  (offering: Term {tp.term})
                </span>
              </div>
              <div className="text-xs text-zinc-600">
                {tp.items.reduce(
                  (s, it) => s + (it.kind === "course" && typeof it.course.units === "number" ? it.course.units : 0),
                  0,
                )}{" "}
                units (listed courses only)
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {tp.items.map((it, idx) =>
                it.kind === "course" ? (
                  <div
                    key={it.course.code}
                    className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-medium text-zinc-900">
                        {it.course.code}{" "}
                        <span className="font-normal text-zinc-700">{it.course.title}</span>
                      </div>
                      <div className="text-xs text-zinc-600">{it.course.type}</div>
                    </div>
                    {it.course.reasons ? (
                      <div className="mt-1 text-xs text-zinc-600 line-clamp-3">{it.course.reasons}</div>
                    ) : null}
                  </div>
                ) : (
                  <div
                    key={`ph-${tp.year}-${tp.term}-${idx}`}
                    className="rounded-xl border border-dashed border-black/20 bg-white px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-semibold text-zinc-900">{it.label}</div>
                      <div className="text-xs text-zinc-600">{it.type}</div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Optional LLM suggestions</div>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-zinc-600">LLM API key (kept in your browser)</span>
            <input
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your key here (e.g. OpenAI-compatible)"
              type="password"
            />
          </label>
          <button
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
            onClick={getLlmSuggestion}
            disabled={llmLoading}
          >
            {llmLoading ? "Generating…" : "Get suggestions"}
          </button>
        </div>
        {llmError ? <div className="mt-2 text-sm text-red-700">{llmError}</div> : null}
        {llmSuggestion ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800">
            {llmSuggestion}
          </pre>
        ) : (
          <div className="mt-2 text-xs text-zinc-600">
            Without a key, the app still provides track-based default plans (Finance, Biomedical,
            AI/ML, Data Analytics, PhD/Theory).
          </div>
        )}
      </div>
    </div>
  );
}


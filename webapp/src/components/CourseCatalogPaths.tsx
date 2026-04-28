"use client";

import { useMemo, useState } from "react";
import type { Course } from "@/lib/types";
import { getPathsForCourse } from "@/lib/paths";

type Props = {
  courses: Course[];
};

type CourseRowProps = {
  course: Course;
  selected: boolean;
  emphasis: "none" | "official" | "suggested";
  onClick: () => void;
};

function CourseRow({ course, selected, emphasis, onClick }: CourseRowProps) {
  const emphasisStyle =
    emphasis === "official"
      ? "border-zinc-900 bg-zinc-100 font-semibold"
      : emphasis === "suggested"
        ? "border-zinc-500 bg-zinc-50 font-semibold"
        : "border-black/10 bg-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border px-3 py-2 transition",
        emphasisStyle,
        selected ? "ring-2 ring-zinc-900" : "hover:bg-zinc-50",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-zinc-900">
            <span className="font-mono text-[12px] text-zinc-700">{course.code}</span>{" "}
            <span className="ml-2">{course.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-zinc-600">
            <span>{course.type}</span>
            <span>•</span>
            <span>{course.recommendedTerm}</span>
          </div>
        </div>
        <div className="shrink-0 text-[11px] text-zinc-600">{course.units ?? 3}u</div>
      </div>
    </button>
  );
}

export function CourseCatalogPaths({ courses }: Props) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const term1 = useMemo(
    () => courses.filter((c) => c.recommendedTerm === "Term 1").sort((a, b) => a.code.localeCompare(b.code)),
    [courses],
  );
  const term2 = useMemo(
    () => courses.filter((c) => c.recommendedTerm === "Term 2").sort((a, b) => a.code.localeCompare(b.code)),
    [courses],
  );

  const selectedCourse = useMemo(
    () => (selectedCode ? courses.find((c) => c.code === selectedCode) : undefined),
    [selectedCode, courses],
  );

  const paths = useMemo(() => {
    if (!selectedCode) return null;
    return getPathsForCourse(selectedCode, courses);
  }, [selectedCode, courses]);

  const officialSet = useMemo(() => new Set(paths?.officialPrereqCodes ?? []), [paths]);
  const suggestedSet = useMemo(() => new Set(paths?.suggestedPrepCodes ?? []), [paths]);

  const badge = (label: string, cls: string) => (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {label}
    </span>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-semibold text-zinc-900">Term 1 courses</div>
            <div className="text-xs text-zinc-600">{term1.length}</div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {term1.map((c) => (
              <CourseRow
                key={c.code}
                course={c}
                selected={c.code === selectedCode}
                emphasis={officialSet.has(c.code) ? "official" : suggestedSet.has(c.code) ? "suggested" : "none"}
                onClick={() => setSelectedCode((prev) => (prev === c.code ? null : c.code))}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-semibold text-zinc-900">Term 2 courses</div>
            <div className="text-xs text-zinc-600">{term2.length}</div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {term2.map((c) => (
              <CourseRow
                key={c.code}
                course={c}
                selected={c.code === selectedCode}
                emphasis={officialSet.has(c.code) ? "official" : suggestedSet.has(c.code) ? "suggested" : "none"}
                onClick={() => setSelectedCode((prev) => (prev === c.code ? null : c.code))}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Path for selected course</div>
        <div className="mt-2 text-xs text-zinc-600">
          Click a course on the left. Official prerequisites come from outlines (when available). Suggested courses are
          advisor recommendations.
        </div>

        {selectedCourse && paths ? (
          <div className="mt-4">
            <div className="text-base font-semibold text-zinc-900">
              {selectedCourse.code}{" "}
              <span className="font-normal text-zinc-700">{selectedCourse.title}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {badge("Official prerequisite", "border-zinc-900 bg-zinc-100 text-zinc-900")}
              {badge("Suggested preparation", "border-zinc-500 bg-zinc-50 text-zinc-800")}
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold text-zinc-900">Official prerequisites (text)</div>
              <div className="mt-2 rounded-xl border border-black/10 bg-zinc-50 p-3 text-sm text-zinc-800 whitespace-pre-wrap">
                {paths.officialPrereqText ? paths.officialPrereqText : "Not stated / not available in the extracted outline text."}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold text-zinc-900">Official prerequisite courses (detected)</div>
              {paths.officialPrereqCodes.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-800">
                  {paths.officialPrereqCodes.map((code) => (
                    <li key={code}>
                      <button
                        className="font-semibold underline underline-offset-2"
                        onClick={() => setSelectedCode(code)}
                        type="button"
                      >
                        {code}
                      </button>
                      {" — "}
                      {courses.find((c) => c.code === code)?.title ?? ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-zinc-700">No prerequisite course codes detected.</div>
              )}
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold text-zinc-900">Suggested courses to take first</div>
              {paths.suggestedPrepCodes.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-800">
                  {paths.suggestedPrepCodes.map((code) => (
                    <li key={code}>
                      <button
                        className="font-semibold underline underline-offset-2"
                        onClick={() => setSelectedCode(code)}
                        type="button"
                      >
                        {code}
                      </button>
                      {" — "}
                      {courses.find((c) => c.code === code)?.title ?? ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-zinc-700">No suggested preparation courses in the current map.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-700">No course selected.</div>
        )}
      </div>
    </div>
  );
}


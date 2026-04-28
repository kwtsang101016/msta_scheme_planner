"use client";

import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";

import type { Course } from "@/lib/types";
import { CORE_LINKS, ELECTIVE_CORE_CODES, coreForCourse } from "@/lib/coreLinks";

type Props = {
  courses: Course[];
};

type NodeData = {
  label: string;
  subtitle: string;
  term: string;
  type: string;
};

function buildReverseAdj(edges: { from: string; to: string }[]) {
  const rev = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!rev.has(e.to)) rev.set(e.to, new Set());
    rev.get(e.to)!.add(e.from);
  }
  return rev;
}

function prereqClosure(target: string, reverseAdj: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    const ps = reverseAdj.get(cur);
    if (!ps) continue;
    for (const p of ps) {
      if (seen.has(p)) continue;
      seen.add(p);
      stack.push(p);
    }
  }
  return seen;
}

export function CourseGraph({ courses }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const nodesAndEdges = useMemo(() => {
    // Graph rule: omit required courses; highlight the three Elective-Core courses as hubs.
    const visible = courses.filter((c) => c.type !== "Required");

    // Simple grid layout: each term is a column; courses stacked.
    const nodes: RFNode<NodeData>[] = [];
    const coreCourses = visible
      .filter((c) => ELECTIVE_CORE_CODES.includes(c.code as (typeof ELECTIVE_CORE_CODES)[number]))
      .sort((a, b) => a.code.localeCompare(b.code));
    const electives = visible
      .filter((c) => !ELECTIVE_CORE_CODES.includes(c.code as (typeof ELECTIVE_CORE_CODES)[number]))
      .sort((a, b) => a.code.localeCompare(b.code));

    // Layout: cores at top row; electives in two columns by offering term.
    coreCourses.forEach((c, i) => {
      nodes.push({
        id: c.code,
        position: { x: i * 380, y: 0 },
        data: { label: c.code, subtitle: c.title, term: c.recommendedTerm, type: c.type },
        style: {
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.15)",
          padding: 12,
          width: 360,
          background: "#0a0a0a",
          color: "white",
        },
      });
    });

    const t1 = electives.filter((c) => c.recommendedTerm === "Term 1");
    const t2 = electives.filter((c) => c.recommendedTerm === "Term 2");
    const place = (list: Course[], x: number) => {
      list.forEach((c, idx) => {
        nodes.push({
          id: c.code,
          position: { x, y: 120 + idx * 86 },
          data: { label: c.code, subtitle: c.title, term: c.recommendedTerm, type: c.type },
          style: {
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.12)",
            padding: 10,
            width: 360,
            background: "white",
          },
        });
      });
    };
    place(t1, 0);
    place(t2, 420);

    // Core-link edges: core -> elective (primary hub).
    const edges: RFEdge[] = CORE_LINKS.map((e) => ({
      id: `${e.core}->${e.course}`,
      source: e.core,
      target: e.course,
      animated: false,
      style: { stroke: "rgba(0,0,0,0.22)" },
    }));

    return { nodes, edges };
  }, [courses]);

  const reverseAdj = useMemo(() => buildReverseAdj(CORE_LINKS.map((x) => ({ from: x.core, to: x.course }))), []);
  const prereqs = useMemo(() => (selected ? prereqClosure(selected, reverseAdj) : new Set()), [selected, reverseAdj]);

  const nodes = useMemo(() => {
    return nodesAndEdges.nodes.map((n) => {
      const isTarget = selected === n.id;
      const isPrereq = prereqs.has(n.id);
      const dim = selected && !isTarget && !isPrereq;
      return {
        ...n,
        style: {
          ...n.style,
          background: isTarget ? "#0a0a0a" : isPrereq ? "#f4f4f5" : "white",
          color: isTarget ? "white" : "#111827",
          opacity: dim ? 0.35 : 1,
          border: isTarget
            ? "1px solid rgba(10,10,10,0.9)"
            : isPrereq
              ? "1px solid rgba(0,0,0,0.20)"
              : "1px solid rgba(0,0,0,0.12)",
        },
      };
    });
  }, [nodesAndEdges.nodes, selected, prereqs]);

  const edges = useMemo(() => {
    return nodesAndEdges.edges.map((e) => {
      const inPath = selected && (e.target === selected || prereqs.has(e.target));
      const dim = selected && !inPath;
      return {
        ...e,
        animated: Boolean(selected && inPath),
        style: {
          stroke: inPath ? "rgba(15, 23, 42, 0.9)" : "rgba(0,0,0,0.18)",
          strokeWidth: inPath ? 2.5 : 1.2,
          opacity: dim ? 0.25 : 1,
        },
      };
    });
  }, [nodesAndEdges.edges, selected, prereqs]);

  const onNodeClick: NodeMouseHandler = (_evt, node) => {
    setSelected((prev) => (prev === node.id ? null : node.id));
  };

  const selectedCourse = useMemo(
    () => (selected ? courses.find((c) => c.code === selected) : undefined),
    [selected, courses],
  );
  const suggestedCore = useMemo(() => (selected ? coreForCourse(selected) : null), [selected]);
  const prereqList = useMemo(() => {
    const list = [...prereqs].sort();
    return list.map((code) => courses.find((c) => c.code === code)).filter(Boolean) as Course[];
  }, [prereqs, courses]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="h-[720px] rounded-2xl border border-black/10 bg-white shadow-sm">
        <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Course path</div>
        <div className="mt-2 text-xs text-zinc-600">
          Click a course to highlight its <span className="font-medium">Elective-Core hub</span>.
          The two required courses are omitted (they are taken in the first term anyway).
        </div>

        {selectedCourse ? (
          <div className="mt-4">
            <div className="text-base font-semibold text-zinc-900">
              {selectedCourse.code}{" "}
              <span className="font-normal text-zinc-700">{selectedCourse.title}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              {selectedCourse.type} • {selectedCourse.recommendedTerm}
            </div>

            <div className="mt-4 text-sm font-semibold text-zinc-900">Elective-Core to consider</div>
            {prereqList.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-zinc-800">
                {prereqList.map((c) => (
                  <li key={c.code}>
                    <span className="font-medium">{c.code}</span> {c.title}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-sm text-zinc-700">
                {suggestedCore ? (
                  <>
                    Suggested core: <span className="font-semibold">{suggestedCore.core}</span>
                    <div className="mt-1 text-xs text-zinc-600">{suggestedCore.reason}</div>
                  </>
                ) : (
                  "No core link available for this course yet."
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-700">Select a course node to see its path.</div>
        )}
      </div>
    </div>
  );
}


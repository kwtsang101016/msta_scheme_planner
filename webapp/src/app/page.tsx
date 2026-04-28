import { CourseCatalogPaths } from "@/components/CourseCatalogPaths";
import { StudyPlanBuilder } from "@/components/StudyPlanBuilder";
import { COURSES } from "@/lib/courseData";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900">MSTA Study Planner</div>
            <div className="text-xs text-zinc-600">
              Study-plan recommendations consistent with the course offering terms.
            </div>
          </div>
          <div className="text-xs text-zinc-600">{COURSES.length} courses</div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-zinc-900">Generate a study plan</h2>
          <StudyPlanBuilder courses={COURSES} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-zinc-900">Course list & paths</h2>
          <CourseCatalogPaths courses={COURSES} />
        </section>
      </main>
    </div>
  );
}

import coursesJson from "@/data/courses.json";
import type { Course } from "@/lib/types";

export const COURSES: Course[] = coursesJson as Course[];

export function getCourseByCode(code: string): Course | undefined {
  return COURSES.find((c) => c.code === code);
}

export function getCoursesByTerm(term: Course["recommendedTerm"]): Course[] {
  return COURSES.filter((c) => c.recommendedTerm === term);
}


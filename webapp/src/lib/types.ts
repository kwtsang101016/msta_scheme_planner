export type CourseType =
  | "Required"
  | "Elective-Core"
  | "Elective-Breath"
  | "Elective-Depth"
  | string;

export type RecommendedTerm = "Year 1 Term 1" | "Year 1 Term 2" | string;

export type Course = {
  code: string;
  title: string;
  units: number | null;
  type: CourseType;
  recommendedTerm: RecommendedTerm;
  reasons: string;
};

export type PlanItem =
  | { kind: "course"; course: Course }
  | { kind: "placeholder"; label: string; type: "Elective-Core" | "Elective-Breath" | "Elective-Depth" };

export type TrackId = "ai_ml" | "finance" | "biomedical" | "data_analytics" | "phd_theory";

export type Track = {
  id: TrackId;
  name: string;
  description: string;
  preferredElectiveCore: string[]; // course codes in preference order
  focusCourses: string[]; // course codes
};

export type TermPlan = {
  year: 1 | 2;
  term: 1 | 2;
  items: PlanItem[];
};


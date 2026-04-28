export const ELECTIVE_CORE_CODES = ["STA5011", "STA5012", "MDS5205"] as const;
export type ElectiveCoreCode = (typeof ELECTIVE_CORE_CODES)[number];

export type CoreLink = {
  course: string; // elective course code
  core: ElectiveCoreCode;
  reason: string;
};

// Each elective is linked to ONE (primary) Elective-Core to answer the practical question:
// "Given my interests, which core should I choose?"
export const CORE_LINKS: CoreLink[] = [
  // AI/ML leaning -> Statistical Learning
  { course: "DDA5001", core: "STA5012", reason: "ML foundations align with statistical learning." },
  { course: "MDS5122", core: "STA5012", reason: "Deep learning builds on statistical learning concepts." },
  { course: "CSC5051", core: "STA5012", reason: "NLP typically builds on ML/statistical learning." },
  { course: "CSC5010", core: "STA5012", reason: "AI overview leads naturally into statistical learning-based methods." },
  { course: "AIR5066", core: "STA5012", reason: "RL is commonly taken after ML/statistical learning basics." },
  { course: "STA5014", core: "STA5012", reason: "High-dimensional stats is closely tied to statistical learning." },

  // Multivariate/data analysis leaning -> Multivariate Statistical Analysis
  { course: "MDS5117", core: "STA5011", reason: "Visualization pairs with multivariate exploratory analysis." },
  { course: "MDS5115", core: "STA5011", reason: "Big-data workflows support multivariate modeling/analysis." },
  { course: "MDS5202", core: "STA5011", reason: "Applied regression + multivariate methods are used together in practice." },
  { course: "STA5013", core: "STA5011", reason: "Causal inference uses regression/multivariate modeling tools." },

  // Time series/finance leaning -> Time Series Analysis
  { course: "MFE5150", core: "MDS5205", reason: "Financial data analysis often relies on time series." },
  { course: "MFE5160", core: "MDS5205", reason: "Risk modeling frequently uses time series and forecasting." },
  { course: "MFE5190", core: "MDS5205", reason: "Credit risk modeling often uses time series + panel/forecasting tools." },

  // Probability/stochastic track – map to a core by analytics usage (multivariate) as default
  { course: "DDA5002", core: "STA5012", reason: "Optimization supports ML/statistical learning workflows." },
  { course: "DDA5003", core: "STA5011", reason: "Stochastic processes complements multivariate/applied modeling preparation." },
  { course: "DDA5005", core: "STA5011", reason: "Simulation is commonly paired with applied multivariate analysis." },
  { course: "DDA6020", core: "STA5011", reason: "Theory depth pairs with broad multivariate/statistics foundations." },
  { course: "DDA6030", core: "STA5011", reason: "Advanced theory pairs with broad multivariate/statistics foundations." },

  // Biomedical
  { course: "MBI6005", core: "STA5011", reason: "Biomedical methods often use multivariate modeling/analysis." },
  { course: "MBI6006", core: "STA5012", reason: "Biomedical ML aligns with statistical learning." },

  // Capstone/internship: link to multivariate as a general foundation
  { course: "STA5020", core: "STA5011", reason: "Capstone projects typically need broad multivariate/statistical tools." },
  { course: "STA5021", core: "STA5011", reason: "Capstone projects typically need broad multivariate/statistical tools." },
  { course: "STA5022", core: "STA5011", reason: "Internship readiness benefits from broad applied statistics toolkit." },
];

export function coreForCourse(code: string): { core: ElectiveCoreCode; reason: string } | null {
  const link = CORE_LINKS.find((x) => x.course === code);
  return link ? { core: link.core, reason: link.reason } : null;
}


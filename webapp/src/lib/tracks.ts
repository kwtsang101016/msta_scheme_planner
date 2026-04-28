import type { Track } from "@/lib/types";

export const TRACKS: Track[] = [
  {
    id: "ai_ml",
    name: "AI / Machine Learning",
    description:
      "For students targeting ML engineering, AI roles, or applied AI research (deep learning, NLP, RL).",
    preferredElectiveCore: ["STA5012", "STA5011", "MDS5205"],
    focusCourses: ["DDA5002", "DDA5001", "MDS5122", "CSC5051", "AIR5066", "CSC5010"],
  },
  {
    id: "finance",
    name: "Finance / Risk / Credit",
    description:
      "For students aiming at quant, risk, and credit analytics roles; emphasizes time series + finance modeling.",
    preferredElectiveCore: ["MDS5205", "STA5011", "STA5012"],
    focusCourses: ["MFE5150", "MFE5160", "MFE5190", "MDS5205"],
  },
  {
    id: "biomedical",
    name: "Biomedical Data Science",
    description:
      "For students interested in biostatistics/biomedical ML, with a balance of methods + applications.",
    preferredElectiveCore: ["STA5012", "STA5011", "MDS5205"],
    focusCourses: ["MBI6005", "DDA5001", "MBI6006", "MDS5122"],
  },
  {
    id: "data_analytics",
    name: "Data Analytics / Visualization",
    description:
      "For students prioritizing practical analytics workflows, reporting, and applied modeling.",
    preferredElectiveCore: ["STA5011", "MDS5205", "STA5012"],
    focusCourses: ["MDS5111", "MDS5117", "MDS5115", "MDS5202", "MFE5150"],
  },
  {
    id: "phd_theory",
    name: "PhD / Theory-leaning",
    description:
      "For students considering PhD study; emphasizes probability/statistics theory and high-dimensional/statistical learning foundations.",
    preferredElectiveCore: ["STA5011", "STA5012", "MDS5205"],
    focusCourses: ["DDA5003", "DDA6020", "DDA6030", "STA5014", "STA5012"],
  },
];


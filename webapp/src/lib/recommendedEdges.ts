export type Edge = { from: string; to: string };

// These edges are *recommended learning paths* (not formal prerequisites).
// They encode: skills/foundations -> advanced/specialized electives.
export const RECOMMENDED_EDGES: Edge[] = [
  { from: "MDS5111", to: "DDA5001" },
  { from: "MDS5111", to: "MDS5122" },
  { from: "MDS5111", to: "CSC5051" },
  { from: "MDS5111", to: "AIR5066" },
  { from: "DDA5002", to: "DDA5001" },
  { from: "DDA5002", to: "MDS5122" },
  { from: "STA5012", to: "MDS5122" },
  { from: "STA5012", to: "STA5014" },
  { from: "STA5012", to: "CSC5051" },
  { from: "CSC5010", to: "AIR5066" },
  { from: "DDA5001", to: "MBI6006" },
  { from: "MBI6005", to: "MBI6006" },
  { from: "STA5002", to: "STA5013" },
  { from: "STA5002", to: "MDS5202" },
  { from: "MFE5150", to: "MFE5160" },
  { from: "MFE5150", to: "MFE5190" },
  { from: "MDS5205", to: "MFE5150" },
  { from: "DDA5003", to: "DDA5005" },
  { from: "DDA5003", to: "DDA6020" },
  { from: "DDA6020", to: "DDA6030" },
];


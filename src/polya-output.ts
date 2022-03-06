import * as rs from "@sodaviz/rmsk-soda";

interface ConfidenceRecord {
  start: number;
  values: number[];
}

interface AlignmentRecord {
  target: string;
  query: string;
  start: number;
  end: number;
  relativeStart: number;
  relativeEnd: number;
  alignStart: number;
  alignEnd: number;
}

export interface HeatmapRecord {
  name: string;
  id: number;
  confidence: ConfidenceRecord[];
  alignments: AlignmentRecord[];
}

export interface PolyaOutput {
  start: number;
  end: number;
  chr: string;
  annotations: rs.RmskRecord[];
  heatmap: HeatmapRecord[];
}

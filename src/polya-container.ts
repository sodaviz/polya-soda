import * as soda from "@sodaviz/soda";
import * as rs from "@sodaviz/rmsk-soda";
import {PolyaOutput} from "./polya-output";

let colors = ["#17becf", "#ff7f0e", "#2ca02c", "#d62728"];

export interface PolyaContainerConfig {
  selector: string;
}

export interface ConfidenceRenderParams extends soda.RenderParams {
  labels: soda.Annotation[];
  confidence: soda.PlotAnnotation[];
  alignments: soda.SequenceAnnotation[];
}

export interface GenomeRenderParams extends soda.RenderParams {
  annotations: soda.SequenceAnnotation[];
}

const labelMap: Map<string, string> = new Map();

export class PolyaContainer {
  charts: soda.Chart<any>[] = [];
  ucscChart: rs.RmskChart;
  polyaChart: rs.RmskChart;
  polyaSelectionChart: rs.RmskChart;
  genomeChart: soda.Chart<GenomeRenderParams>;
  confidenceChart: soda.Chart<ConfidenceRenderParams>;
  annotationCache: rs.RmskAnnotationGroup[] = [];
  confidenceCache: soda.AnnotationGroup<soda.PlotAnnotation>[] = [];
  alignmentCache: soda.AnnotationGroup<soda.SequenceAnnotation>[] = [];
  chromosome: string | undefined;
  semanticBrushRange: [number, number] | undefined;
  confidenceVisible = true;
  alignmentsVisible = true;

  constructor(config: PolyaContainerConfig) {
    let chartConf = {
      ...config,
      resizable: true,
      divOutline: "1px solid black",
      rowHeight: 16,
      padSize: 0,
    };

    this.ucscChart = new rs.RmskChart({
      ...chartConf,
      upperPadSize: 25,
    });

    const container = this;
    this.polyaChart = new rs.RmskChart({
      ...chartConf,
      lowerPadSize: 20,
      postResize(): void {
        container.initializeBrush();
      },
    });

    this.polyaSelectionChart = new rs.RmskChart({
      ...chartConf,
      upperPadSize: 25,
    });

    this.genomeChart = new soda.Chart({
      ...chartConf,
      draw(params): void {
        soda.sequence({
          chart: this,
          selector: "genome",
          annotations: params.annotations,
          y: (d) => d.c.rowHeight * (d.c.layout.row(d) + 1) - 3,
        });
      },
    });

    this.confidenceChart = new soda.Chart({
      ...chartConf,
      rowHeight: 30,
      divHeight: 200,
      divOverflowY: "scroll",
      draw(params) {
        soda.heatmap({
          annotations: params.confidence,
          chart: this,
          colorScheme: soda.internalD3.interpolateGreys,
          fillOpacity: 0.8,
          outlineColor: "black",
          selector: "confidence",
        });

        soda.simpleText({
          chart: this,
          selector: "labels",
          annotations: params.labels,
          y: (d) => d.c.rowHeight * d.c.layout.row(d) + 4,
          fillColor: colors[0],
          text: (d) => labelMap.get(d.a.id)!,
        });

        let alignments = params.alignments.filter((ann) => !ann.id.includes("insert"))
        let insertions = params.alignments.filter((ann) => ann.id.includes("insert"))

        soda.sequence({
          chart: this,
          selector: "alignments",
          annotations: alignments,
          y: (d) => d.c.rowHeight * (d.c.layout.row(d) + 1) - 3,
          fillColor: (d) => (d.a.id.includes("matches") ? colors[2] : colors[1]),
        });

        soda.simpleText({
          chart: this,
          selector: "insertions",
          annotations: insertions,
          y: (d) => d.c.rowHeight * d.c.layout.row(d) + 4,
          fillColor: colors[3],
          textAnchor: "middle",
          text: "\u25bc",
        });

        soda.hoverBehavior({
          chart: this,
          annotations: insertions,
          mouseover: (s, d) => {
            this.viewportSelection
              .selectAll("text.labels-internal")
              .style("fill-opacity", 0.2);
            s.text(d.a.sequence);
          },
          mouseout: (s) => {
            this.viewportSelection
              .selectAll("text.labels-internal")
              .style("fill-opacity", 1.0);
            s.text("\u25bc");
          },
        });
      },
    });

    let confWidth = parseInt(this.confidenceChart.viewportSelection.attr("width"));
    let otherWidth = this.genomeChart.calculateContainerWidth();
    this.polyaSelectionChart.rightPadSize = otherWidth - confWidth;
    this.genomeChart.rightPadSize = otherWidth - confWidth;

    this.charts = [
      this.ucscChart,
      this.polyaChart,
      this.polyaSelectionChart,
      this.genomeChart,
      this.confidenceChart,
    ];
  }

  public clear(): void {
    this.annotationCache = [];
    this.confidenceCache = [];
    this.alignmentCache = [];
    for (const chart of this.charts) {
      chart.clear();
    }
  }

  public render(obj: PolyaOutput) {
    this.clear();
    this.chromosome = obj.chr;
    this.ucscChart.query({
      chromosome: obj.chr,
      start: obj.start,
      end: obj.end,
    });

    this.annotationCache = obj.annotations.map((r) => rs.RmskBedParse(r))
    this.initializeBrush();

    this.polyaChart.render({
      annotations: this.annotationCache,
      start: obj.start,
      end: obj.end,
    });

    for (const [row, rec] of obj.heatmap.entries()) {
      let rowId = `row-${row}`;
      labelMap.set(`${rowId}-conf`, rec.name);

      let confGroup = new soda.AnnotationGroup<soda.PlotAnnotation>({id: `${rowId}-conf`})
      let aliGroup = new soda.AnnotationGroup<soda.SequenceAnnotation>({id: `${rowId}-ali`})
      for (let i = 0; i < rec.confidence.length; i++) {
        let conf = rec.confidence[i];
        confGroup.add({
          ...conf,
          id: `${rowId}-conf-${i}`,
          end: conf.start + conf.values.length
        });

        let ali = rec.alignments[i];
        if (ali != undefined) {
          let alignmentAnnotations = soda.getAlignmentAnnotations({
            id: `${rowId}-ali-${i}`,
            start: conf.start + 0.5,
            target: ali.target.slice(ali.relativeStart, ali.relativeEnd),
            query: ali.query.slice(ali.relativeStart, ali.relativeEnd),
          });
          aliGroup.add([
            alignmentAnnotations.matches,
            alignmentAnnotations.substitutions,
            alignmentAnnotations.gaps,
            ...alignmentAnnotations.inserts
          ]);
        }
      }
      this.confidenceCache.push(confGroup);
      this.alignmentCache.push(aliGroup);
    }
  }

  public renderBrushSelection() {
    if (this.chromosome != undefined && this.semanticBrushRange != undefined) {
      let start = this.semanticBrushRange[0];
      let end = this.semanticBrushRange[1];
      let url = `https://sodaviz.org/data/hg38/${this.chromosome}/${start}/${end}`;
      fetch(url)
        .then((response) => response.text())
        .then((genomeSeq: string) =>
          this.genomeChart.render({
            start,
            end,
            annotations: [
              {
                id: "genome",
                start: start + 0.5,
                end: end + 1.5,
                sequence: genomeSeq.toUpperCase(),
              },
            ],
          })
        );

      let labels: soda.Annotation[] = [];
      let confidence: soda.PlotAnnotation[] = [];
      let alignments: soda.SequenceAnnotation[] = [];

      let layoutMap: Map<string, number> = new Map();
      this.confidenceChart.layout.row = (d) => layoutMap.get(d.a.id) || 0

      let overlappingConfidence = this.confidenceCache.filter((g) => g.start < end && g.end > start)
      let rowCount = 0;
      for (const group of overlappingConfidence) {
        let sliced = soda.slicePlotAnnotations({annotations: group.annotations, start, end});
        if (sliced != undefined) {
          for (const ann of sliced.annotations) {
            confidence.push(ann);
            layoutMap.set(ann.id, rowCount);
          }
          labels.push({id: group.id, start: Math.max(start, sliced.start), end});
          layoutMap.set(group.id, rowCount);
          rowCount++
        }
      }

      let overlappingAlignments = this.alignmentCache.filter((g) => g.start < end && g.end > start)
      rowCount = 0;
      for (const group of overlappingAlignments) {
        let sliced = soda.sliceSequenceAnnotations({
          annotations: group.annotations,
          start: start + 0.5,
          end: end + 0.5
        });
        if (sliced != undefined) {
          for (const ann of sliced.annotations) {
            alignments.push(ann);
            layoutMap.set(ann.id, rowCount + 1);
          }
          rowCount++
        }
      }
      
      rowCount++;
      this.confidenceChart.render({
        labels,
        confidence,
        alignments,
        start,
        end,
        rowCount,
      });

      let annotations = this.annotationCache.filter(
        (ann) => ann.start < end && ann.end > start
      );

      this.polyaSelectionChart.render({
        annotations,
        start: start,
        end: end,
      });
    }
  }

  public toggleConfidence(): void {
    this.confidenceVisible = !this.confidenceVisible;
    let value = this.confidenceVisible ? "visible" : "hidden";
    this.confidenceChart.viewportSelection
      .selectAll("g.confidence")
      .style("visibility", value);
  }

  public toggleAlignments(): void {
    this.alignmentsVisible = !this.alignmentsVisible;
    let value = this.alignmentsVisible ? "visible" : "hidden";
    this.confidenceChart.viewportSelection
      .selectAll("g.alignments, g.insertions")
      .style("visibility", value);
  }

  public initializeBrush() {
    this.polyaChart.viewportSelection.call(
      rs.sodaInternalD3
        .brushX()
        .extent([
          [0, 0],
          [this.polyaChart.viewportWidthPx, this.polyaChart.viewportHeightPx + 1],
        ])
        .on("start", () => this.initializeBrushExtension())
        .on("brush", () => {
          let coords = rs.sodaInternalD3.event.selection;
          this.semanticBrushRange = [
            Math.round(this.polyaChart.xScale.invert(coords[0])),
            Math.round(this.polyaChart.xScale.invert(coords[1])),
          ];
          this.moveBrushExtension(coords[0], coords[1]);
        })
        .on("end", () => this.renderBrushSelection())
    );

    if (this.semanticBrushRange != undefined) {
      let start = this.polyaChart.xScale(this.semanticBrushRange[0])!;
      let end = this.polyaChart.xScale(this.semanticBrushRange[1])!;
      this.polyaChart.viewportSelection.call(rs.sodaInternalD3.brushX().move, [
        start,
        end,
      ]);
      this.moveBrushExtension(start, end);
    }
  }

  public initializeBrushExtension() {
    this.polyaChart.overflowViewportSelection
      .selectAll("path.brush-extension")
      .data(["brush-extension"])
      .enter()
      .append("path")
      .attr("class", "brush-extension")
      .style("fill", "#777")
      .style("fill-opacity", "0.3");
  }

  public moveBrushExtension(start: number, end: number) {
    if (this.semanticBrushRange != undefined) {
      this.polyaChart.overflowViewportSelection
        .selectAll("path.brush-extension")
        .attr(
          "d",
          `M 0 ${this.polyaChart.calculatePadHeight()}` +
          `L ${start} ${this.polyaChart.viewportHeight}` +
          `L ${end} ${this.polyaChart.viewportHeight}` +
          `L ${this.polyaChart.viewportWidth} ${this.polyaChart.calculatePadHeight()} Z`
        );
    }
  }
}

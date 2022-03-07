import * as soda from "@sodaviz/soda";
import * as rs from "@sodaviz/rmsk-soda";
import { PolyaOutput } from "./polya-output";

let colors = ["#17becf", "#ff7f0e", "#2ca02c", "#d62728"];

export interface PolyaContainerConfig {
  selector: string;
}

export interface ConfidenceRenderParams extends soda.RenderParams {
  annotations: soda.AnnotationGroup<
    soda.ContinuousAnnotation | soda.SequenceAnnotation
  >[];
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
  annotationCache: rs.RmskAnnotation[] = [];
  confidenceCache: soda.AnnotationGroup<
    soda.ContinuousAnnotation | soda.SequenceAnnotation
  >[] = [];
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
      axisType: soda.AxisType.Bottom,
      upperPadSize: 20,
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
      axisType: soda.AxisType.Bottom,
      upperPadSize: 20,
    });

    this.genomeChart = new soda.Chart({
      ...chartConf,
      inRender(params): void {
        soda.sequence({
          chart: this,
          selector: "genome",
          annotations: params.annotations,
          y: (d) => d.c.rowHeight * (d.a.y + 1) - 3,
        });
      },
    });

    this.confidenceChart = new soda.Chart({
      ...chartConf,
      rowHeight: 30,
      divHeight: 200,
      divOverflowY: "scroll",
      inRender(params) {
        let alignments: soda.SequenceAnnotation[] = [];
        let insertions: soda.SequenceAnnotation[] = [];
        let confidence: soda.ContinuousAnnotation[] = [];
        for (const group of params.annotations.map((g) => g.group)) {
          for (const ann of group) {
            if ((<soda.ContinuousAnnotation>ann).points != undefined) {
              confidence.push(<soda.ContinuousAnnotation>ann);
            } else {
              if (ann.tag != "inserts") {
                alignments.push(<soda.SequenceAnnotation>ann);
              } else {
                insertions.push(<soda.SequenceAnnotation>ann);
              }
            }
          }
        }

        soda.heatmap({
          chart: this,
          colorScheme: soda.internalD3.interpolateGreys,
          fillOpacity: 0.8,
          outlineColor: "black",
          selector: "confidence",
          annotations: confidence,
        });

        soda.sequence({
          chart: this,
          selector: "alignments",
          annotations: alignments,
          y: (d) => d.c.rowHeight * (d.a.y + 1) - 3,
          fillColor: (d) => (d.a.tag == "matches" ? colors[2] : colors[1]),
        });

        soda.text({
          chart: this,
          selector: "labels",
          annotations: params.annotations,
          y: (d) => d.c.rowHeight * d.a.y + 4,
          fillColor: colors[0],
          textFn: (a) => [labelMap.get(a.id)!],
        });

        soda.text({
          chart: this,
          selector: "insertions",
          annotations: insertions,
          y: (d) => d.c.rowHeight * d.a.y + 4,
          fillColor: colors[3],
          textAnchor: "middle",
          textFn: () => ["\u25bc"],
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

    this.annotationCache = this.polyaChart.buildAnnotations(obj.annotations);
    let rowCount = Math.max(...this.annotationCache.map((a) => a.row)) + 2;

    this.polyaChart.render({ rowCount });

    this.initializeBrush();

    this.polyaChart.render({
      annotations: this.annotationCache,
      start: obj.start,
      end: obj.end,
      rowCount,
    });

    for (const [row, rec] of obj.heatmap.entries()) {
      let rowId = `row-${row}`;
      labelMap.set(rowId, rec.name);
      let group = new soda.AnnotationGroup<
        soda.ContinuousAnnotation | soda.SequenceAnnotation
      >({
        id: rowId,
        row: row,
      });

      for (let i = 0; i < rec.confidence.length; i++) {
        let conf = rec.confidence[i];
        group.add(
          new soda.ContinuousAnnotation({
            id: `${rowId}-conf-${i}`,
            tag: "confidence",
            start: conf.start,
            end: conf.start + conf.values.length,
            row,
            values: conf.values,
          })
        );
        let ali = rec.alignments[i];

        if (ali) {
          let alignmentAnnotations = soda.Contrib.getAlignmentAnnotations({
            id: `${rowId}-ali-${i}`,
            start: conf.start + 0.5,
            row,
            target: ali.target.slice(ali.relativeStart, ali.relativeEnd),
            query: ali.query.slice(ali.relativeStart, ali.relativeEnd),
          });
          group.add(alignmentAnnotations.all);
        }
      }
      this.confidenceCache.push(group);
    }
  }

  public renderBrushSelection() {
    if (this.chromosome != undefined && this.semanticBrushRange != undefined) {
      let start = this.semanticBrushRange[0];
      let end = this.semanticBrushRange[1];
      let url = `https://sodaviz.org/hg38/${this.chromosome}/range?start=${start}&end=${end}`;
      fetch(url)
        .then((response) => response.text())
        .then((genomeSeq: string) =>
          this.genomeChart.render({
            start,
            end,
            annotations: [
              new soda.SequenceAnnotation({
                start: start + 0.5,
                end: end + 1.5,
                sequence: genomeSeq.toUpperCase(),
              }),
            ],
          })
        );

      let confidence: soda.AnnotationGroup<
        soda.ContinuousAnnotation | soda.SequenceAnnotation
      >[] = [];
      let row = 0;
      for (const group of this.confidenceCache) {
        let newGroup = new soda.AnnotationGroup<
          soda.ContinuousAnnotation | soda.SequenceAnnotation
        >({
          id: group.id,
        });
        for (const ann of group.group) {
          let slicedAnn:
            | soda.ContinuousAnnotation
            | soda.SequenceAnnotation
            | undefined;
          if (ann.tag == "confidence") {
            slicedAnn = soda.Contrib.sliceContinuousAnnotation(
              <soda.ContinuousAnnotation>ann,
              start,
              end
            );
          } else {
            slicedAnn = soda.Contrib.sliceSequenceAnnotation(
              <soda.SequenceAnnotation>ann,
              start + 0.5,
              end + 0.5
            );
          }
          if (slicedAnn != undefined) {
            newGroup.add(slicedAnn);
          }
        }
        if (newGroup.group.length > 0) {
          newGroup.y = row++;
          confidence.push(newGroup);
        }
      }

      this.confidenceChart.render({
        annotations: confidence,
        start: start,
        end: end,
        rowCount: confidence.length,
      });

      let annotations = this.annotationCache.filter(
        (ann) => ann.start < end && ann.end > start
      );

      let rowCount = Math.max(...annotations.map((a) => a.row)) + 2;
      this.polyaSelectionChart.render({
        annotations,
        start: start,
        end: end,
        rowCount,
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
          [this.polyaChart.viewportWidth, this.polyaChart.viewportHeight + 1],
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
          `M 0 ${this.polyaChart.padHeight}` +
            `L ${start} ${this.polyaChart.viewportHeight}` +
            `L ${end} ${this.polyaChart.viewportHeight}` +
            `L ${this.polyaChart.viewportWidth} ${this.polyaChart.padHeight} Z`
        );
    }
  }
}

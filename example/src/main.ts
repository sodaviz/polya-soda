import * as ps from "@sodaviz/polya-soda";
import {Spinner} from "spin.js";

let container = new ps.PolyaContainer({selector: "#charts"});
let spinner = new Spinner({
  color: "cadetblue",
  position: "relative",
  top: "100px"
});

function submitFile(): void {
  let input = <HTMLInputElement>document.getElementById("file-input")!;
  let file = input.files![0];
  spinner.spin(document.querySelector<HTMLDivElement>("#charts")!);
  file.text().then((data: string) => submitData(data));
}

function submitExample(): void {
  let input = <HTMLInputElement>document.getElementById("example-selection")!;
  let example = input.value;
  spinner.spin(document.querySelector<HTMLDivElement>("#charts")!);
  fetch(`https://sodaviz.org/polya/${example}`)
    .then((response) => response.text())
    .then((data: string) => submitData(data));
}

function submitData(data: string): void {
  let obj: ps.PolyaOutput | ps.PolyaOutput[] = JSON.parse(data);
  if (Array.isArray(obj)) {
    container.render(obj[0]);
  } else {
    container.render(obj);
  }
  spinner.stop();
}

function updateFileLabel(this: HTMLInputElement): void {
  if (this.files) {
    document.getElementById('file-label')!.innerHTML = this.files[0].name;
  }
}

let collapsibleElements = document.getElementsByClassName("collapsible");
for (let i = 0; i < collapsibleElements.length; i++) {
  collapsibleElements[i].addEventListener("click", function (this: any) {
    this.classList.toggle("active");
    let content = this.nextElementSibling;
    if (content.style.maxHeight) {
      content.style.maxHeight = null;
    } else {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });
}

document.getElementById('file-input')!
  .addEventListener("change", updateFileLabel)
document.getElementById("submit-file")!
  .addEventListener("click", submitFile);
document.getElementById("submit-example")!
  .addEventListener("click", submitExample);
document
  .getElementById("toggle-confidence")!
  .addEventListener("click", () => container.toggleConfidence());
document
  .getElementById("toggle-alignments")!
  .addEventListener("click", () => container.toggleAlignments());

import "./ui/style.css";

const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view) {
  void import("./viewer").then((m) => m.startViewer(view, params));
} else {
  void import("./app").then((m) => m.startGame(params));
}

import "./style.css";
import { Game } from "./engine";

const mount = document.getElementById("app");
if (mount) {
  new Game(mount);
}

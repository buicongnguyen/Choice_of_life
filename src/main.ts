import { mountChoiceOfLifeInBrowser } from "./choice-of-life/app";

const mount = document.getElementById("app");
if (!mount) {
  throw new Error("Choice of Life mount element is missing");
}

const application = mountChoiceOfLifeInBrowser(mount);

if (import.meta.hot) {
  import.meta.hot.dispose(() => application.dispose());
}

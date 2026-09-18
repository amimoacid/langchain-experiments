import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { Briefing } from "./briefing-page.jsx";
import { Health } from "./health-page.jsx";
import "./style.css";

const path = location.pathname;
const page = path.startsWith("/briefing") ? (
  <Briefing />
) : path.startsWith("/health") ? (
  <Health />
) : (
  <App />
);
createRoot(document.getElementById("root")).render(page);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { I18nProvider } from "./i18n";
import "./styles/tokens.css";
import "./styles/base.css";

document.documentElement.lang = localStorage.getItem("tw.lang") || "en";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider><AuthProvider><App /></AuthProvider></I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

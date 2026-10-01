import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { I18nProvider } from "./i18n";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ConfirmHost } from "./ui/confirm";
import "./styles/tokens.css";
import "./styles/base.css";

document.documentElement.lang = localStorage.getItem("tw.lang") || "en";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary><I18nProvider><AuthProvider><App /><ConfirmHost /></AuthProvider></I18nProvider></ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);

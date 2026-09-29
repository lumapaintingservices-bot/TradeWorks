import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { Icon } from "../ui/Icon";
import ChartsTab from "./dashboard/ChartsTab";
import MoneyTab from "./dashboard/MoneyTab";
import OverviewTab from "./dashboard/OverviewTab";
import SourcesTab from "./dashboard/SourcesTab";
import TodayTab from "./dashboard/TodayTab";

const TABS = [["overview", "Overview", "Resumen"], ["today", "Today", "Hoy"], ["money", "Money", "Dinero"], ["charts", "Charts", "Gráficas"], ["sources", "Where clients come from", "De dónde vienen los clientes"]] as const;
type Tab = (typeof TABS)[number][0];

/** Dashboard shell: header + tabs. Each tab lives in src/pages/dashboard/*Tab.tsx. */
export default function Dashboard() {
  const t = useT();
  const nav = useNavigate();
  const { company } = useAuth();
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem("tw.dashTab") as Tab) || "overview"; } catch { return "overview"; } });
  const pick = (k: Tab) => { setTab(k); try { localStorage.setItem("tw.dashTab", k); } catch { /* ignore */ } };
  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Overview", "Resumen")}</h1><p>{company?.area}</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => nav("/pipeline")}>{t("Pipeline", "Embudo")}</button>
          <button className="btn pri" onClick={() => nav("/estimates?new=1")}><Icon name="plus" />{t("New estimate", "Nuevo presupuesto")}</button>
        </div>
      </div>
      <div className="tabs">{TABS.map(([k, en, es]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => pick(k)}>{t(en, es)}</button>)}</div>
      {tab === "overview" && <OverviewTab />}
      {tab === "today" && <TodayTab />}
      {tab === "money" && <MoneyTab />}
      {tab === "charts" && <ChartsTab />}
      {tab === "sources" && <SourcesTab />}
    </div>
  );
}

import { useT } from "../i18n";
import { EmptyState } from "../ui/EmptyState";

export default function Placeholder({ en, es, icon, phase }: { en: string; es: string; icon: string; phase: number }) {
  const t = useT();
  return (
    <div className="page">
      <div className="page-h"><div><h1>{t(en, es)}</h1></div></div>
      <div className="card"><EmptyState icon={icon} title={t("Nothing here yet", "Aún no hay nada")}
        text={t(`This screen arrives in phase ${phase}.`, `Esta pantalla llega en la fase ${phase}.`)} /></div>
    </div>
  );
}

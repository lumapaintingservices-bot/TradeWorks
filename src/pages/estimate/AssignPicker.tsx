import { useT } from "../../i18n";
import { Avatar, AvatarGroup } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import { Popover } from "../../ui/Popover";

export type CrewPerson = { id: string; name: string; photo?: string | null };

/**
 * "Who does it?" for a checklist line or a whole day (shadcn Popover + checkable list). The button shows the people on it, or
 * "Whole crew" when nobody in particular has it (then everyone on the crew sees the line). `selected` = the people on it
 * (for a day: the people on every line of that day).
 */
export function AssignPicker({ crew, selected, onToggle, onClear, day }: {
  crew: CrewPerson[]; selected: string[]; onToggle(id: string): void; onClear(): void; day?: boolean;
}) {
  const t = useT();
  const on = crew.filter((p) => selected.includes(p.id));
  const trigger = day
    ? <><Icon name="team" size={14} />{t("Assign day", "Asignar día")}</>
    : on.length
      ? <AvatarGroup people={on.map((p) => ({ name: p.name, src: p.photo }))} max={3} size="xs" />
      : <><Icon name="team" size={14} />{t("Whole crew", "Todo el equipo")}</>;
  const label = day ? t("Who does this whole day?", "¿Quién hace todo este día?")
    : on.length ? t(`Done by ${on.map((p) => p.name).join(", ")} — change`, `Lo hace ${on.map((p) => p.name).join(", ")} — cambiar`)
    : t("Whole crew — pick who does it", "Todo el equipo — elegir quién lo hace");
  return (
    <Popover label={label} align="end" triggerClass={"as-btn" + (day ? " day" : on.length ? " set" : "")} trigger={trigger}>
      {() => (
        <>
          <div className="pop-h">{day ? t("Who does this day?", "¿Quién hace este día?") : t("Who does it?", "¿Quién lo hace?")}</div>
          <button type="button" className="pop-it" onClick={onClear} aria-pressed={!selected.length}>
            <span className="as-all"><Icon name="team" size={14} /></span>{t("Whole crew", "Todo el equipo")}
            {!selected.length && <span className="pop-tick"><Icon name="check" size={16} /></span>}
          </button>
          <div className="pop-sep" />
          {crew.map((p) => {
            const is = selected.includes(p.id);
            return (
              <button key={p.id} type="button" className="pop-it" aria-pressed={is} onClick={() => onToggle(p.id)}>
                <Avatar name={p.name} src={p.photo} size="sm" />{p.name}
                {is && <span className="pop-tick"><Icon name="check" size={16} /></span>}
              </button>);
          })}
        </>
      )}
    </Popover>
  );
}

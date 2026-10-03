import { Icon } from "./Icon";
import { Popover } from "./Popover";
import "./ui.css";

/**
 * One button that opens the list of periods (idea from shadcn's Select / Dropdown Menu): "This month ▾" instead of a row of
 * pills. Used by Expenses, Reports and the dashboard tabs so every page picks its period the same way.
 */
export function RangeSelect<K extends string>({ items, value, onChange, label, small }: {
  items: [K, string][]; value: K; onChange(k: K): void; label: string; small?: boolean;
}) {
  const cur = items.find(([k]) => k === value)?.[1] || items[0]?.[1] || "";
  return (
    <Popover label={label} triggerClass={"btn rs-btn" + (small ? " sm" : "")} trigger={<>
      <Icon name="calendar" size={16} /><span className="rs-v">{cur}</span>
      <svg className="rs-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 10 5 5 5-5" /></svg></>}>
      {(close) => <div role="listbox" aria-label={label}>
        {items.map(([k, text]) => (
          <button key={k} type="button" role="option" aria-selected={k === value} className="pop-it" onClick={() => { onChange(k); close(); }}>
            {text}{k === value && <span className="pop-tick">✓</span>}
          </button>))}
      </div>}
    </Popover>
  );
}

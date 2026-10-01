import { describe, expect, it } from "vitest";
import { isDanger, okWord, splitQuestion } from "./confirmText";

describe("confirm window text", () => {
  it("splits the question from the explanation", () => {
    expect(splitQuestion("Delete this estimate? This can't be undone.")).toEqual({ title: "Delete this estimate?", body: "This can't be undone." });
    expect(splitQuestion("¿Borrar esta nota?")).toEqual({ title: "¿Borrar esta nota?", body: "" });
    expect(splitQuestion("No question here.")).toEqual({ title: "No question here.", body: "" });
  });
  it("marks destructive actions", () => {
    expect(isDanger("Delete this note?")).toBe(true);
    expect(isDanger("¿Quitar tu logo?")).toBe(true);
    expect(isDanger("Restore 12 records? Records with the same ID will be replaced.")).toBe(false);
    expect(isDanger("Use this as the standard? (it will not delete anything)")).toBe(false);
  });
  it("uses the question's verb on the button", () => {
    expect(okWord("Delete invoice INV-1?", false)).toBe("Delete");
    expect(okWord("¿Borrar la factura INV-1?", true)).toBe("Borrar");
    expect(okWord("Take EST-1 off the calendar?", false)).toBe("Take off");
    expect(okWord("¿Cancelar la invitación de a@b.c?", true)).toBe("Sí, cancelar");
    expect(okWord("This worker has hours. Mark as inactive instead?", false)).toBe("Yes");
    expect(okWord("Este trabajador tiene horas. ¿Marcarlo como inactivo?", true)).toBe("Sí");
  });
});

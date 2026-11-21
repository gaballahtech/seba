// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { SebaLoginElement } from "../../src/element.js";

describe("seba-login accessibility", () => {
  it("mounts and passes axe-core audit with no critical violations", async () => {
    if (!customElements.get("seba-login")) {
      customElements.define("seba-login", SebaLoginElement);
    }

    const el = document.createElement("seba-login");
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));

    const shadow = el.shadowRoot;
    expect(shadow).not.toBeNull();

    const results = await axe.run(shadow as HTMLElement, { rules: {} });
    const seriousViolations = results.violations.filter(
      (v) => ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(seriousViolations).toHaveLength(0);
  });
});
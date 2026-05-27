import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, version } from "../src/index";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("BigraphViz.mount / unmount", () => {
  beforeEach(() => { document.body.innerHTML = ""; window.location.hash = ""; });

  it("exposes a version string", () => {
    expect(typeof version).toBe("string");
  });

  it("renders into the given element with a canvas + inspector child", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    mount(el, cellSpec);
    expect(el.querySelector(".bgv2-canvas")).not.toBeNull();
    expect(el.querySelector(".bgv2-inspector")).not.toBeNull();
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("respects inspector=false", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    mount(el, cellSpec, { inspector: false });
    expect(el.querySelector(".bgv2-inspector")).toBeNull();
  });

  it("unmount removes content and detaches handlers", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    mount(el, cellSpec);
    unmount(el);
    expect(el.innerHTML).toBe("");
  });
});

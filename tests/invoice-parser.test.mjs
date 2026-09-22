import test from "node:test";
import assert from "node:assert/strict";

import { splitRouteDriver } from "../src/lib/invoice-driver-identity.ts";

test("nie bierze Łuczyc za nazwisko kierowcy z wielowierszowego PDF", () => {
  const result = splitRouteDriver("DOJAZDÓW, YEVHENII", ["/D ŁUCZYCE PITIANIN"]);

  assert.equal(result.driverName, "YEVHENII PITIANIN");
  assert.equal(result.route, "DOJAZDÓW ŁUCZYCE");
});

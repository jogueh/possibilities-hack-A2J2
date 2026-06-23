// ⚠️ W3-TEMPORARY test setup — reconcile with W1's stack bootstrap. See plan.md
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

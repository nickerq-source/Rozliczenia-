import React from "react";
import { createRoot } from "react-dom/client";
import { FleetPanel } from "../src/components/admin-preview/FleetPanel";

// Only the isolated local test server implements this endpoint.
fetch("/test-state").then(response => response.json()).then(state => {
  createRoot(document.getElementById("root")!).render(<FleetPanel source={state.data} updatedAt={state.updated_at} />);
});

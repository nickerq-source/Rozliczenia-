import React from "react";
import { createRoot } from "react-dom/client";
import { AdminPreview } from "../src/components/admin-preview/AdminPreview";
import { previewFixture } from "./fixtures/admin-preview";

createRoot(document.getElementById("root")!).render(<AdminPreview source={previewFixture} updatedAt="2026-11-17T12:00:00Z" />);

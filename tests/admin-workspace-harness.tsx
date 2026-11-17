import { createRoot } from "react-dom/client";
import { WorkspaceView } from "../src/components/WorkspaceView";
createRoot(document.getElementById("root")!).render(<WorkspaceView token="synthetic-workspace" initialUserName="Test admin" isAdmin />);

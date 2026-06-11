"use client";

// Hook audit logu — wiąże workspaceId i userName, zwraca logChange

import { useCallback } from "react";
import { logChange as rawLogChange, AuditParams } from "@/lib/audit";

type LogParams = Omit<AuditParams, "workspaceId" | "userName">;

export function useAuditLog(workspaceId: string, userName: string) {
  const logChange = useCallback(
    (params: LogParams) => {
      rawLogChange({ ...params, workspaceId, userName });
    },
    [workspaceId, userName]
  );

  return { logChange };
}

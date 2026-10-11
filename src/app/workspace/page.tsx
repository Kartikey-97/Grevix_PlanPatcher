import React from "react";
import { PlanPatchWorkspace } from "../../components/PlanPatchWorkspace";

export const metadata = {
  title: "PlanPatch — Workspace",
  description: "Plan recovery and change orchestration workspace.",
};

export default function WorkspacePage() {
  return <PlanPatchWorkspace />;
}

"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConceptAEditorial } from "../components/design-lab/ConceptAEditorial";
import { PlanPatchWorkspace } from "../components/PlanPatchWorkspace";

function HomeContent() {
  const searchParams = useSearchParams();
  const mode = searchParams ? searchParams.get("mode") : null;
  const scenario = searchParams ? searchParams.get("scenario") : null;
  const view = searchParams ? searchParams.get("view") : null;

  // When visiting with workspace query parameters (e.g., from CTAs or scenario links), mount the workspace
  if (mode || scenario || view === "workspace") {
    return <PlanPatchWorkspace />;
  }

  // Otherwise, render the Concept A editorial landing page
  return <ConceptAEditorial showNav={true} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<ConceptAEditorial showNav={true} />}>
      <HomeContent />
    </Suspense>
  );
}

import type { ChallengeSourceAdapter } from "@/scrapers/types";
import { wsdmCupAdapter } from "@/scrapers/wsdm";
import { recsysChallengeAdapter } from "@/scrapers/recsys";
import { kddCupAdapter } from "@/scrapers/kdd";
import { neuripsCompetitionsAdapter } from "@/scrapers/neurips";
import { semevalAdapter } from "@/scrapers/semeval";
import { icasspGrandChallengesAdapter } from "@/scrapers/icassp";
import { grandChallengeAdapter } from "@/scrapers/miccai";
import { cvprAdapter } from "@/scrapers/cvpr";

/**
 * Section 10 — every adapter is registered here by its `sourceId`, which
 * must match `source_series.adapter_name` in the database. Adding a new
 * source means adding one line here (Section 64), never touching the job
 * runner or any other adapter.
 */
const adapters: ChallengeSourceAdapter[] = [
  wsdmCupAdapter,
  recsysChallengeAdapter,
  kddCupAdapter,
  neuripsCompetitionsAdapter,
  semevalAdapter,
  icasspGrandChallengesAdapter,
  grandChallengeAdapter,
  cvprAdapter,
];

const adapterById = new Map(adapters.map((adapter) => [adapter.sourceId, adapter]));

export function getAdapter(adapterName: string): ChallengeSourceAdapter {
  const adapter = adapterById.get(adapterName);
  if (!adapter) {
    throw new Error(`No adapter registered for adapter_name "${adapterName}"`);
  }
  return adapter;
}

export function listAdapters(): ChallengeSourceAdapter[] {
  return adapters;
}

/**
 * Section 33 — Initial Source Registry, and Section 9.6 / 9.8 taxonomy seed
 * values. Kept as a plain data module (not inline in seed.ts) so scripts and
 * tests can both import the canonical list without re-declaring it.
 */
import { slugify } from "@/lib/slug";

export type VenueSeed = { name: string; shortName?: string; homepageUrl?: string };

export const VENUES: VenueSeed[] = [
  // General AI / ML
  { name: "NeurIPS", homepageUrl: "https://neurips.cc/" },
  { name: "ICML", homepageUrl: "https://icml.cc/" },
  { name: "ICLR", homepageUrl: "https://iclr.cc/" },
  { name: "AAAI", homepageUrl: "https://aaai.org/conference/aaai/" },
  { name: "IJCAI", homepageUrl: "https://www.ijcai.org/" },
  // Computer Vision
  { name: "CVPR", homepageUrl: "https://cvpr.thecvf.com/" },
  { name: "ICCV", homepageUrl: "https://iccv.thecvf.com/" },
  { name: "ECCV", homepageUrl: "https://eccv.ecva.net/" },
  { name: "WACV", homepageUrl: "https://wacv.thecvf.com/" },
  // Data Mining / Search / Recommendation / Web
  { name: "KDD", shortName: "SIGKDD", homepageUrl: "https://kdd.org/" },
  { name: "WSDM", homepageUrl: "https://www.wsdm-conference.org/" },
  { name: "RecSys", homepageUrl: "https://recsys.acm.org/" },
  { name: "SIGIR", homepageUrl: "https://sigir.org/" },
  { name: "CIKM", homepageUrl: "https://www.cikm2026.org/" },
  { name: "The Web Conference", shortName: "WWW", homepageUrl: "https://www2026.thewebconf.org/" },
  { name: "ECML-PKDD", homepageUrl: "https://ecmlpkdd.org/" },
  { name: "PAKDD", homepageUrl: "https://pakdd.org/" },
  { name: "TREC", homepageUrl: "https://trec.nist.gov/" },
  { name: "CLEF", homepageUrl: "https://www.clef-initiative.eu/" },
  // Multimedia
  { name: "ACM Multimedia", shortName: "ACM MM", homepageUrl: "https://www.acmmm.org/" },
  // NLP
  { name: "ACL", homepageUrl: "https://www.aclweb.org/" },
  { name: "EMNLP", homepageUrl: "https://2026.emnlp.org/" },
  { name: "NAACL", homepageUrl: "https://naacl.org/" },
  { name: "SemEval", homepageUrl: "https://semeval.github.io/" },
  { name: "WMT", homepageUrl: "https://www2.statmt.org/wmt26/" },
  // Speech / Audio
  { name: "ICASSP", homepageUrl: "https://2026.ieeeicassp.org/" },
  { name: "INTERSPEECH", homepageUrl: "https://www.interspeech2026.org/" },
  { name: "DCASE", homepageUrl: "https://dcase.community/" },
  // Medical AI
  { name: "MICCAI", homepageUrl: "https://miccai.org/" },
  { name: "MIDL", homepageUrl: "https://2026.midl.io/" },
  { name: "ISBI", homepageUrl: "https://biomedicalimaging.org/2026/" },
  { name: "Grand-Challenge.org", shortName: "Grand Challenge", homepageUrl: "https://grand-challenge.org/" },
  // Robotics
  { name: "ICRA", homepageUrl: "https://2026.ieee-icra.org/" },
  { name: "IROS", homepageUrl: "https://iros2026.org/" },
  { name: "RoboCup", homepageUrl: "https://robocup.org/" },
  // Optimization
  { name: "IEEE CEC", homepageUrl: "https://www.ieee-cec.org/" },
];

export const DOMAINS = [
  "Computer Vision",
  "NLP",
  "LLM",
  "Agents",
  "Information Retrieval",
  "Recommender Systems",
  "Data Mining",
  "Audio",
  "Speech",
  "Multimodal",
  "Medical AI",
  "Robotics",
  "Scientific ML",
  "Optimization",
  "General ML",
];

export const TASK_TAGS = [
  "super-resolution",
  "segmentation",
  "retrieval",
  "recommendation",
  "reasoning",
  "tool-use",
  "generation",
  "classification",
  "deepfake-detection",
  "speech-recognition",
  "medical-imaging",
  "robot-navigation",
];

export type SourceSeriesSeed = {
  name: string;
  venueName: string; // must match a VENUES[].name
  adapterName: string;
  rootUrl: string;
  enabled: boolean;
  discoveryStrategy: string;
  priority: "A" | "B" | "C";
};

/**
 * Section 34 — Source Implementation Priority. Priority A adapters are
 * registered `enabled: true` and implemented in scrapers/*.ts (Section 10);
 * Priority B/C are seeded `enabled: false` as documented roadmap entries
 * (Stage 6) so the registry reflects the full target venue list without
 * claiming crawl coverage the codebase doesn't have yet (Section 70 rule 15
 * vs. rule 1 — the registry is complete, the adapters roll out in stages).
 */
export const SOURCE_SERIES: SourceSeriesSeed[] = [
  // Priority A — implemented
  { name: "NeurIPS Competitions", venueName: "NeurIPS", adapterName: "neurips", rootUrl: "https://neurips.cc/", enabled: true, discoveryStrategy: "conference-navigation", priority: "A" },
  { name: "WSDM Cup", venueName: "WSDM", adapterName: "wsdm", rootUrl: "https://www.wsdm-conference.org/", enabled: true, discoveryStrategy: "manual-mapping", priority: "A" },
  { name: "KDD Cup", venueName: "KDD", adapterName: "kdd", rootUrl: "https://kdd.org/", enabled: true, discoveryStrategy: "manual-mapping", priority: "A" },
  { name: "RecSys Challenge", venueName: "RecSys", adapterName: "recsys", rootUrl: "https://www.recsyschallenge.com/", enabled: true, discoveryStrategy: "predictable-url", priority: "A" },
  { name: "SemEval", venueName: "SemEval", adapterName: "semeval", rootUrl: "https://semeval.github.io/", enabled: true, discoveryStrategy: "stable-homepage", priority: "A" },
  { name: "ICASSP SP Grand Challenges", venueName: "ICASSP", adapterName: "icassp", rootUrl: "https://2026.ieeeicassp.org/", enabled: true, discoveryStrategy: "manual-mapping", priority: "A" },
  { name: "MICCAI / Grand-Challenge.org", venueName: "MICCAI", adapterName: "grand-challenge", rootUrl: "https://grand-challenge.org/challenges/", enabled: true, discoveryStrategy: "stable-index", priority: "A" },
  { name: "CVPR Challenges", venueName: "CVPR", adapterName: "cvpr", rootUrl: "https://cvpr.thecvf.com/", enabled: true, discoveryStrategy: "conference-navigation", priority: "A" },

  // Priority B — registered, awaiting adapter implementation (Stage 6)
  { name: "ICCV Challenges", venueName: "ICCV", adapterName: "iccv", rootUrl: "https://iccv.thecvf.com/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "ECCV Challenges", venueName: "ECCV", adapterName: "eccv", rootUrl: "https://eccv.ecva.net/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "WACV Challenges", venueName: "WACV", adapterName: "wacv", rootUrl: "https://wacv.thecvf.com/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "SIGIR Challenges", venueName: "SIGIR", adapterName: "sigir", rootUrl: "https://sigir.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "CIKM Challenges", venueName: "CIKM", adapterName: "cikm", rootUrl: "https://www.cikm2026.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "CLEF Labs", venueName: "CLEF", adapterName: "clef", rootUrl: "https://www.clef-initiative.eu/", enabled: false, discoveryStrategy: "stable-homepage", priority: "B" },
  { name: "TREC Tracks", venueName: "TREC", adapterName: "trec", rootUrl: "https://trec.nist.gov/", enabled: false, discoveryStrategy: "stable-homepage", priority: "B" },
  { name: "MIDL Challenges", venueName: "MIDL", adapterName: "midl", rootUrl: "https://2026.midl.io/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "ISBI Challenges", venueName: "ISBI", adapterName: "isbi", rootUrl: "https://biomedicalimaging.org/2026/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "INTERSPEECH Challenges", venueName: "INTERSPEECH", adapterName: "interspeech", rootUrl: "https://www.interspeech2026.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "DCASE Challenge", venueName: "DCASE", adapterName: "dcase", rootUrl: "https://dcase.community/", enabled: false, discoveryStrategy: "stable-homepage", priority: "B" },
  { name: "ICRA Challenges", venueName: "ICRA", adapterName: "icra", rootUrl: "https://2026.ieee-icra.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },
  { name: "IROS Challenges", venueName: "IROS", adapterName: "iros", rootUrl: "https://iros2026.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "B" },

  // Priority C — registered, awaiting adapter implementation (Stage 6)
  { name: "ICML Workshop Challenges", venueName: "ICML", adapterName: "icml", rootUrl: "https://icml.cc/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "ICLR Workshop Challenges", venueName: "ICLR", adapterName: "iclr", rootUrl: "https://iclr.cc/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "AAAI Competitions", venueName: "AAAI", adapterName: "aaai", rootUrl: "https://aaai.org/conference/aaai/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "IJCAI Competitions", venueName: "IJCAI", adapterName: "ijcai", rootUrl: "https://www.ijcai.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "ACL Shared Tasks", venueName: "ACL", adapterName: "acl", rootUrl: "https://www.aclweb.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "EMNLP Shared Tasks", venueName: "EMNLP", adapterName: "emnlp", rootUrl: "https://2026.emnlp.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "NAACL Shared Tasks", venueName: "NAACL", adapterName: "naacl", rootUrl: "https://naacl.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "ACM Multimedia Grand Challenges", venueName: "ACM Multimedia", adapterName: "acm-mm", rootUrl: "https://www.acmmm.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "ECML-PKDD Discovery Challenge", venueName: "ECML-PKDD", adapterName: "ecml-pkdd", rootUrl: "https://ecmlpkdd.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "PAKDD Data Mining Competition", venueName: "PAKDD", adapterName: "pakdd", rootUrl: "https://pakdd.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
  { name: "RoboCup", venueName: "RoboCup", adapterName: "robocup", rootUrl: "https://robocup.org/", enabled: false, discoveryStrategy: "stable-homepage", priority: "C" },
  { name: "IEEE CEC Competitions", venueName: "IEEE CEC", adapterName: "ieee-cec", rootUrl: "https://www.ieee-cec.org/", enabled: false, discoveryStrategy: "conference-navigation", priority: "C" },
];

export function venueSlug(name: string): string {
  return slugify(name);
}

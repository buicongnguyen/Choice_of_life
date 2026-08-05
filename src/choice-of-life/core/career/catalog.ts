import { deepFreeze } from "../immutable";
import type {
  CareerCatalog,
  CareerDefinition,
  CareerId,
  CareerOutfitMetadata,
  CareerOutfitVariant,
  CareerSignal,
} from "./types";

function signal(
  level: CareerSignal["level"],
  label: string,
): CareerSignal {
  return { level, label };
}

function outfit(
  outfitId: string,
  label: string,
  season: CareerOutfitVariant["season"],
  top: string,
  bottoms: string,
  footwear: string,
  accessories: readonly string[],
  palette: readonly [string, string, string],
  sleeveStyle: CareerOutfitVariant["sleeveStyle"],
): CareerOutfitVariant {
  return {
    outfitId,
    label,
    season,
    top,
    bottoms,
    footwear,
    accessories,
    palette,
    sleeveStyle,
  };
}

function wardrobe(
  careerId: CareerId,
  standard: Omit<CareerOutfitVariant, "outfitId" | "season">,
  summer: Omit<CareerOutfitVariant, "outfitId" | "season">,
): CareerOutfitMetadata {
  return {
    standard: outfit(
      `${careerId}-standard-v1`,
      standard.label,
      "standard",
      standard.top,
      standard.bottoms,
      standard.footwear,
      standard.accessories,
      standard.palette,
      standard.sleeveStyle,
    ),
    summer: outfit(
      `${careerId}-summer-v1`,
      summer.label,
      "summer",
      summer.top,
      summer.bottoms,
      summer.footwear,
      summer.accessories,
      summer.palette,
      summer.sleeveStyle,
    ),
  };
}

const DEFINITIONS = [
  {
    careerId: "teacher",
    title: "Teacher",
    entryRoleTitle: "Classroom Teacher",
    qualifiedRoleTitle: "Experienced Teacher",
    summary: "Help young people learn while balancing preparation, care, and classroom demands.",
    labels: {
      income: signal(2, "Income · Steady"),
      pressure: signal(3, "Pressure · Demanding"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Deep purpose"),
    },
    economy: { salaryMoneyDelta: 8, recurringCostMoneyDelta: -5, healthDelta: -1, happinessDelta: 3 },
    qualificationPaths: [{ pathId: "teacher-degree-v1", label: "Education degree", allCredentials: ["education-degree"] }],
    retraining: {
      programId: "teacher-retraining-v1",
      title: "Complete teacher training",
      description: "Earn an education degree through a supported teaching pathway.",
      durationMonths: 18,
      costMoneyDelta: -9,
      grantsCredentials: ["education-degree"],
    },
    pressureStory: {
      callbackId: "teacher-pressure-v1",
      title: "A class needs more from you",
      prompt: "Lesson planning is spilling into every evening. How will you respond?",
      supportRole: "fellow teacher",
    },
    outfits: wardrobe("teacher", {
      label: "Layered classroom outfit", top: "soft knit cardigan over a collared shirt", bottoms: "tailored ankle trousers", footwear: "supportive loafers", accessories: ["canvas book tote", "name badge"], palette: ["#2F6F76", "#F3C969", "#5B4636"], sleeveStyle: "long",
    }, {
      label: "Summer classroom outfit", top: "breathable short-sleeve blouse or polo", bottoms: "lightweight knee-length skirt or tailored shorts", footwear: "soft low-profile sneakers", accessories: ["small book satchel", "name badge"], palette: ["#3E8E94", "#FFE39A", "#76543E"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "chef",
    title: "Chef",
    entryRoleTitle: "Line Chef",
    qualifiedRoleTitle: "Head Chef",
    summary: "Turn craft and timing into memorable meals in a fast-moving kitchen.",
    labels: {
      income: signal(3, "Income · Growing"),
      pressure: signal(4, "Pressure · High heat"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Creative craft"),
    },
    economy: { salaryMoneyDelta: 10, recurringCostMoneyDelta: -6, healthDelta: -3, happinessDelta: 3 },
    qualificationPaths: [{ pathId: "chef-certificate-v1", label: "Culinary certificate", allCredentials: ["culinary-certificate"] }],
    retraining: {
      programId: "chef-retraining-v1", title: "Join culinary school", description: "Build professional kitchen skills and food-safety credentials.", durationMonths: 12, costMoneyDelta: -7, grantsCredentials: ["culinary-certificate"],
    },
    pressureStory: { callbackId: "chef-pressure-v1", title: "The dinner rush", prompt: "Orders are stacking up and the kitchen is tense. What pace do you set?", supportRole: "sous-chef" },
    outfits: wardrobe("chef", {
      label: "Classic kitchen whites", top: "double-breasted chef jacket", bottoms: "dark checked kitchen trousers", footwear: "non-slip kitchen clogs", accessories: ["apron", "chef cap"], palette: ["#FFF8E7", "#323B45", "#D35D45"], sleeveStyle: "long",
    }, {
      label: "Cool kitchen uniform", top: "short-sleeve breathable chef jacket", bottoms: "lightweight cropped kitchen trousers", footwear: "non-slip kitchen clogs", accessories: ["waist apron", "bandana"], palette: ["#FFF4D6", "#415463", "#E36D4F"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "barista",
    title: "Barista",
    entryRoleTitle: "Cafe Barista",
    qualifiedRoleTitle: "Lead Barista",
    summary: "Create small daily rituals and a welcoming neighborhood meeting place.",
    labels: {
      income: signal(1, "Income · Modest"),
      pressure: signal(2, "Pressure · Busy bursts"),
      purposeAutonomy: signal(3, "Purpose / Autonomy · Social craft"),
    },
    economy: { salaryMoneyDelta: 6, recurringCostMoneyDelta: -4, healthDelta: 0, happinessDelta: 3 },
    qualificationPaths: [{ pathId: "barista-open-entry-v1", label: "Open entry" }],
    retraining: null,
    pressureStory: { callbackId: "barista-pressure-v1", title: "The morning queue", prompt: "The line reaches the door and a new teammate needs help. What do you prioritize?", supportRole: "cafe teammate" },
    outfits: wardrobe("barista", {
      label: "Cafe apron outfit", top: "rolled-sleeve cotton shirt", bottoms: "straight dark jeans", footwear: "cushioned sneakers", accessories: ["cross-back apron", "order pad"], palette: ["#4F7565", "#E8C99B", "#49362D"], sleeveStyle: "rolled",
    }, {
      label: "Summer cafe outfit", top: "short-sleeve cotton tee", bottoms: "lightweight work shorts", footwear: "cushioned sneakers", accessories: ["short cafe apron", "order pad"], palette: ["#6B9983", "#F4D7A8", "#574033"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "athlete",
    title: "Athlete",
    entryRoleTitle: "Professional Athlete",
    qualifiedRoleTitle: "Veteran Athlete",
    summary: "Turn discipline and teamwork into a high-risk, high-energy sporting career.",
    labels: {
      income: signal(4, "Income · High but variable"),
      pressure: signal(5, "Pressure · Elite competition"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Mastery"),
    },
    economy: { salaryMoneyDelta: 13, recurringCostMoneyDelta: -7, healthDelta: -4, happinessDelta: 3 },
    qualificationPaths: [
      { pathId: "athlete-record-v1", label: "Competitive sport record", allCredentials: ["competitive-sport-record"] },
      { pathId: "athlete-scouted-v1", label: "Scouted physical talent", minimumGrade: "good", allExperienceTags: ["physical-training", "teamwork"] },
    ],
    retraining: { programId: "athlete-trial-v1", title: "Enter an elite sports academy", description: "Train full time and compete for a professional place.", durationMonths: 18, costMoneyDelta: -8, grantsCredentials: ["competitive-sport-record"] },
    pressureStory: { callbackId: "athlete-pressure-v1", title: "A place in the starting team", prompt: "The next match could define your season, but your body needs recovery. What do you do?", supportRole: "team physio" },
    outfits: wardrobe("athlete", {
      label: "Competition tracksuit", top: "team warm-up jacket over performance jersey", bottoms: "tapered training pants", footwear: "performance trainers", accessories: ["sports watch", "team bag"], palette: ["#2457A6", "#F5B642", "#F7F7F2"], sleeveStyle: "long",
    }, {
      label: "Summer training kit", top: "breathable team jersey", bottoms: "performance shorts", footwear: "lightweight trainers", accessories: ["sports watch", "water bottle"], palette: ["#3474C8", "#FFD66B", "#FFFFFF"], sleeveStyle: "sleeveless",
    }),
  },
  {
    careerId: "entrepreneur",
    title: "Entrepreneur",
    entryRoleTitle: "Startup Founder",
    qualifiedRoleTitle: "Established Founder",
    summary: "Build an idea into a livelihood with unusual freedom and unusual uncertainty.",
    labels: {
      income: signal(3, "Income · Variable upside"),
      pressure: signal(5, "Pressure · Uncertain"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Very high autonomy"),
    },
    economy: { salaryMoneyDelta: 11, recurringCostMoneyDelta: -7, healthDelta: -3, happinessDelta: 3 },
    qualificationPaths: [
      { pathId: "entrepreneur-open-entry-v1", label: "Open venture path", minimumMoney: 10 },
      { pathId: "entrepreneur-experience-v1", label: "Small-business experience", allExperienceTags: ["small-business"] },
    ],
    retraining: null,
    pressureStory: { callbackId: "entrepreneur-pressure-v1", title: "A risky growth decision", prompt: "A promising opportunity will consume your remaining time and savings. How do you proceed?", supportRole: "co-founder" },
    outfits: wardrobe("entrepreneur", {
      label: "Relaxed founder layers", top: "structured overshirt over a plain tee", bottoms: "smart tapered trousers", footwear: "clean sneakers", accessories: ["laptop bag", "smart watch"], palette: ["#244C66", "#E8795E", "#F1C75B"], sleeveStyle: "long",
    }, {
      label: "Summer founder outfit", top: "open short-sleeve shirt over a breathable tee", bottoms: "tailored shorts", footwear: "clean canvas sneakers", accessories: ["slim laptop sleeve", "smart watch"], palette: ["#31708F", "#F29478", "#FFE08A"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "engineer",
    title: "Engineer",
    entryRoleTitle: "Graduate Engineer",
    qualifiedRoleTitle: "Professional Engineer",
    summary: "Design reliable systems and solve physical problems with patient precision.",
    labels: {
      income: signal(4, "Income · Strong"),
      pressure: signal(3, "Pressure · Project deadlines"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Applied impact"),
    },
    economy: { salaryMoneyDelta: 12, recurringCostMoneyDelta: -6, healthDelta: -1, happinessDelta: 2 },
    qualificationPaths: [{ pathId: "engineer-degree-v1", label: "Engineering degree", allCredentials: ["engineering-degree"] }],
    retraining: { programId: "engineer-retraining-v1", title: "Study engineering", description: "Complete an accredited engineering conversion course.", durationMonths: 30, costMoneyDelta: -12, grantsCredentials: ["engineering-degree"] },
    pressureStory: { callbackId: "engineer-pressure-v1", title: "The design review", prompt: "A deadline is close, but one assumption deserves another check. What do you do?", supportRole: "project engineer" },
    outfits: wardrobe("engineer", {
      label: "Site-ready engineer outfit", top: "utility overshirt over a collared shirt", bottoms: "reinforced work trousers", footwear: "safety boots", accessories: ["hard hat", "rolled plans"], palette: ["#315B6D", "#F2B84B", "#574C43"], sleeveStyle: "long",
    }, {
      label: "Summer site outfit", top: "high-visibility short-sleeve technical polo", bottoms: "lightweight work trousers", footwear: "safety boots", accessories: ["vented hard hat", "tablet"], palette: ["#39788A", "#FFD45E", "#6A5B4D"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "software-engineer",
    title: "Software Engineer",
    entryRoleTitle: "Junior Software Engineer",
    qualifiedRoleTitle: "Senior Software Engineer",
    summary: "Build useful digital systems through logic, collaboration, and continuous learning.",
    labels: {
      income: signal(4, "Income · Strong"),
      pressure: signal(3, "Pressure · Release cycles"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Flexible craft"),
    },
    economy: { salaryMoneyDelta: 13, recurringCostMoneyDelta: -6, healthDelta: -2, happinessDelta: 2 },
    qualificationPaths: [
      { pathId: "software-degree-v1", label: "Computer science degree", allCredentials: ["computer-science-degree"] },
      { pathId: "software-portfolio-v1", label: "Demonstrated software portfolio", allCredentials: ["software-portfolio"] },
    ],
    retraining: { programId: "software-retraining-v1", title: "Build a software portfolio", description: "Complete an intensive practical program and publish working projects.", durationMonths: 12, costMoneyDelta: -8, grantsCredentials: ["software-portfolio"] },
    pressureStory: { callbackId: "software-pressure-v1", title: "The late release", prompt: "A release is slipping and the team is tired. How do you respond?", supportRole: "engineering teammate" },
    outfits: wardrobe("software-engineer", {
      label: "Smart casual developer outfit", top: "soft hoodie over a clean tee", bottoms: "tapered chinos", footwear: "comfortable sneakers", accessories: ["laptop backpack", "headphones"], palette: ["#4055A8", "#5BC0BE", "#F4D35E"], sleeveStyle: "long",
    }, {
      label: "Summer developer outfit", top: "short-sleeve knit polo", bottoms: "breathable tailored shorts", footwear: "comfortable sneakers", accessories: ["laptop backpack", "headphones"], palette: ["#536DD1", "#73D2CE", "#FFE27A"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "manager",
    title: "Manager",
    entryRoleTitle: "Team Manager",
    qualifiedRoleTitle: "Department Manager",
    summary: "Coordinate people and priorities while creating the conditions for a team to succeed.",
    labels: {
      income: signal(4, "Income · Strong"),
      pressure: signal(4, "Pressure · People and targets"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Leadership"),
    },
    economy: { salaryMoneyDelta: 12, recurringCostMoneyDelta: -6, healthDelta: -2, happinessDelta: 1 },
    qualificationPaths: [
      { pathId: "manager-business-v1", label: "Business degree and leadership", allCredentials: ["business-degree"], allExperienceTags: ["leadership"] },
      { pathId: "manager-experience-v1", label: "Management experience", allCredentials: ["management-experience"] },
    ],
    retraining: { programId: "manager-retraining-v1", title: "Complete a management program", description: "Learn practical team leadership through a supervised placement.", durationMonths: 12, costMoneyDelta: -7, grantsCredentials: ["management-experience"] },
    pressureStory: { callbackId: "manager-pressure-v1", title: "Two urgent priorities", prompt: "Two teams need the same limited resources. How will you lead the decision?", supportRole: "team lead" },
    outfits: wardrobe("manager", {
      label: "Modern management tailoring", top: "unstructured blazer over a fine knit top", bottoms: "tailored trousers", footwear: "polished low-heel shoes", accessories: ["work folio", "simple watch"], palette: ["#364B63", "#D98C70", "#F0C987"], sleeveStyle: "long",
    }, {
      label: "Summer management tailoring", top: "short-sleeve structured blouse or shirt", bottoms: "light tailored trousers or knee-length skirt", footwear: "breathable loafers", accessories: ["slim work folio", "simple watch"], palette: ["#4D6985", "#E9A389", "#FFE0A3"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "financial-analyst",
    title: "Financial Analyst",
    entryRoleTitle: "Financial Analyst",
    qualifiedRoleTitle: "Senior Financial Analyst",
    summary: "Turn complex financial information into careful decisions and long-term plans.",
    labels: {
      income: signal(4, "Income · Strong"),
      pressure: signal(4, "Pressure · Deadline driven"),
      purposeAutonomy: signal(3, "Purpose / Autonomy · Analytical influence"),
    },
    economy: { salaryMoneyDelta: 13, recurringCostMoneyDelta: -6, healthDelta: -2, happinessDelta: 0 },
    qualificationPaths: [{ pathId: "finance-degree-v1", label: "Finance degree", allCredentials: ["finance-degree"] }],
    retraining: { programId: "finance-retraining-v1", title: "Study financial analysis", description: "Earn a finance qualification through an applied conversion course.", durationMonths: 20, costMoneyDelta: -10, grantsCredentials: ["finance-degree"] },
    pressureStory: { callbackId: "finance-pressure-v1", title: "The forecast deadline", prompt: "New information arrives just before a major forecast is due. What do you do?", supportRole: "finance colleague" },
    outfits: wardrobe("financial-analyst", {
      label: "Professional analyst outfit", top: "tailored jacket over a crisp shirt", bottoms: "coordinated trousers", footwear: "polished office shoes", accessories: ["document case", "calculator watch"], palette: ["#243A57", "#A6C8D5", "#C8994B"], sleeveStyle: "long",
    }, {
      label: "Summer analyst outfit", top: "short-sleeve collared blouse or shirt", bottoms: "light tailored trousers", footwear: "soft leather loafers", accessories: ["slim document case", "calculator watch"], palette: ["#35577D", "#C1E0EA", "#D8AD62"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "artist",
    title: "Artist",
    entryRoleTitle: "Independent Artist",
    qualifiedRoleTitle: "Established Artist",
    summary: "Make original work, shape your own schedule, and build an audience over time.",
    labels: {
      income: signal(2, "Income · Irregular"),
      pressure: signal(2, "Pressure · Self-directed"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Creative freedom"),
    },
    economy: { salaryMoneyDelta: 7, recurringCostMoneyDelta: -5, healthDelta: 1, happinessDelta: 5 },
    qualificationPaths: [
      { pathId: "artist-portfolio-v1", label: "Arts portfolio", allCredentials: ["arts-portfolio"] },
      { pathId: "artist-practice-v1", label: "Sustained creative practice", allExperienceTags: ["creative-practice"] },
    ],
    retraining: { programId: "artist-retraining-v1", title: "Build an arts portfolio", description: "Join a studio program and prepare a body of original work.", durationMonths: 10, costMoneyDelta: -5, grantsCredentials: ["arts-portfolio"] },
    pressureStory: { callbackId: "artist-pressure-v1", title: "The difficult commission", prompt: "A well-paid commission conflicts with the work you want to make. What do you choose?", supportRole: "studio friend" },
    outfits: wardrobe("artist", {
      label: "Layered studio outfit", top: "paint-marked work jacket over a soft shirt", bottoms: "roomy utility trousers", footwear: "sturdy canvas shoes", accessories: ["brush roll", "sketchbook"], palette: ["#7A4E79", "#E47756", "#E5C25A"], sleeveStyle: "rolled",
    }, {
      label: "Summer studio outfit", top: "loose short-sleeve linen shirt", bottoms: "paint-marked work shorts", footwear: "canvas slip-ons", accessories: ["brush roll", "sketchbook"], palette: ["#986397", "#F08D6B", "#F2D978"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "police",
    title: "Police Officer",
    entryRoleTitle: "Patrol Officer",
    qualifiedRoleTitle: "Senior Officer",
    summary: "Protect the community through public service, judgment, and calm under pressure.",
    labels: {
      income: signal(3, "Income · Steady"),
      pressure: signal(5, "Pressure · High responsibility"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Public service"),
    },
    economy: { salaryMoneyDelta: 10, recurringCostMoneyDelta: -5, healthDelta: -4, happinessDelta: 2 },
    qualificationPaths: [{ pathId: "police-academy-v1", label: "Police academy", allCredentials: ["police-academy"] }],
    retraining: { programId: "police-retraining-v1", title: "Attend the police academy", description: "Complete community, safety, and practical officer training.", durationMonths: 12, costMoneyDelta: -6, grantsCredentials: ["police-academy"] },
    pressureStory: { callbackId: "police-pressure-v1", title: "A tense call", prompt: "A difficult situation needs patience as well as action. How do you approach it?", supportRole: "patrol partner" },
    outfits: wardrobe("police", {
      label: "Community officer uniform", top: "navy long-sleeve duty shirt", bottoms: "reinforced duty trousers", footwear: "supportive duty boots", accessories: ["badge", "radio", "utility belt"], palette: ["#203A5F", "#77A6B6", "#D7B35B"], sleeveStyle: "long",
    }, {
      label: "Summer officer uniform", top: "navy short-sleeve duty shirt", bottoms: "lightweight duty trousers", footwear: "supportive duty boots", accessories: ["badge", "radio", "utility belt"], palette: ["#2B4D7A", "#8BC0CE", "#E5C66E"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "lawyer",
    title: "Lawyer",
    entryRoleTitle: "Junior Lawyer",
    qualifiedRoleTitle: "Senior Lawyer",
    summary: "Use research and advocacy to help people navigate important, difficult decisions.",
    labels: {
      income: signal(5, "Income · High"),
      pressure: signal(5, "Pressure · Intense"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Advocacy"),
    },
    economy: { salaryMoneyDelta: 15, recurringCostMoneyDelta: -7, healthDelta: -4, happinessDelta: 0 },
    qualificationPaths: [{ pathId: "law-degree-v1", label: "Law degree", allCredentials: ["law-degree"] }],
    retraining: { programId: "law-retraining-v1", title: "Study law", description: "Complete a professional law conversion and supervised practice route.", durationMonths: 36, costMoneyDelta: -14, grantsCredentials: ["law-degree"] },
    pressureStory: { callbackId: "lawyer-pressure-v1", title: "The case before dawn", prompt: "A vital case needs more preparation, but your team has worked all night. What do you do?", supportRole: "legal colleague" },
    outfits: wardrobe("lawyer", {
      label: "Court-ready tailoring", top: "dark tailored jacket over a crisp shirt", bottoms: "matching formal trousers or knee-length skirt", footwear: "polished formal shoes", accessories: ["case file", "structured work bag"], palette: ["#252B3A", "#EEE8D8", "#8B304A"], sleeveStyle: "long",
    }, {
      label: "Summer legal outfit", top: "lightweight short-sleeve formal shirt", bottoms: "breathable tailored trousers or knee-length skirt", footwear: "polished loafers", accessories: ["case file", "slim work bag"], palette: ["#3B4358", "#FFF6E5", "#AD4B65"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "ceo",
    title: "CEO",
    entryRoleTitle: "Chief Executive Officer",
    qualifiedRoleTitle: "Established CEO",
    summary: "Set direction for an organization while carrying responsibility for its people and future.",
    labels: {
      income: signal(5, "Income · Exceptional"),
      pressure: signal(5, "Pressure · Organization-wide"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Maximum agency"),
    },
    economy: { salaryMoneyDelta: 17, recurringCostMoneyDelta: -8, healthDelta: -5, happinessDelta: 0 },
    qualificationPaths: [{ pathId: "ceo-experience-v1", label: "Business and executive experience", allCredentials: ["business-degree", "executive-experience"], allExperienceTags: ["leadership"] }],
    retraining: null,
    pressureStory: { callbackId: "ceo-pressure-v1", title: "A decision that affects everyone", prompt: "A difficult choice could protect the balance sheet or protect the team. How do you lead?", supportRole: "operations director" },
    outfits: wardrobe("ceo", {
      label: "Executive tailoring", top: "finely tailored jacket over a premium knit or shirt", bottoms: "matching tailored trousers", footwear: "polished executive shoes", accessories: ["leather folio", "classic watch"], palette: ["#202D45", "#C9A96E", "#F3EEE5"], sleeveStyle: "long",
    }, {
      label: "Summer executive tailoring", top: "lightweight short-sleeve structured shirt", bottoms: "summer-weight tailored trousers", footwear: "polished breathable loafers", accessories: ["slim folio", "classic watch"], palette: ["#304566", "#DFC385", "#FFF9EF"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "doctor",
    title: "Doctor",
    entryRoleTitle: "Resident Doctor",
    qualifiedRoleTitle: "Qualified Doctor",
    summary: "Build clinical skill through supervised training, then carry high-stakes responsibility for patients.",
    labels: {
      income: signal(5, "Income · High after training"),
      pressure: signal(5, "Pressure · Very high"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Direct care"),
    },
    economy: { salaryMoneyDelta: 16, recurringCostMoneyDelta: -7, healthDelta: -5, happinessDelta: 1 },
    qualificationPaths: [
      { pathId: "doctor-resident-v1", label: "Medical degree — resident entry", allCredentials: ["medical-degree"] },
      { pathId: "doctor-qualified-v1", label: "Medical degree and completed residency", allCredentials: ["medical-degree", "medical-residency"] },
    ],
    retraining: { programId: "doctor-retraining-v1", title: "Begin professional medical study", description: "Complete the academic route required to enter supervised residency.", durationMonths: 72, costMoneyDelta: -18, grantsCredentials: ["medical-degree"] },
    pressureStory: { callbackId: "doctor-pressure-v1", title: "Care after a long shift", prompt: "Another patient needs careful attention after an exhausting day. How will you protect care and wellbeing?", supportRole: "senior clinician" },
    outfits: wardrobe("doctor", {
      label: "Clinical coat and scrubs", top: "white clinical coat over teal scrubs", bottoms: "straight scrub trousers", footwear: "supportive clinical shoes", accessories: ["stethoscope", "hospital badge"], palette: ["#F8FAF4", "#259A9A", "#334E68"], sleeveStyle: "long",
    }, {
      label: "Summer clinical scrubs", top: "short-sleeve breathable scrub top", bottoms: "lightweight scrub trousers", footwear: "supportive clinical shoes", accessories: ["stethoscope", "hospital badge"], palette: ["#FDFDF7", "#34B3AF", "#456A85"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "nurse",
    title: "Nurse",
    entryRoleTitle: "Registered Nurse",
    qualifiedRoleTitle: "Senior Nurse",
    summary: "Combine clinical skill and human care at the center of a busy health team.",
    labels: {
      income: signal(3, "Income · Steady"),
      pressure: signal(5, "Pressure · High care load"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Compassionate care"),
    },
    economy: { salaryMoneyDelta: 10, recurringCostMoneyDelta: -5, healthDelta: -4, happinessDelta: 3 },
    qualificationPaths: [{ pathId: "nurse-license-v1", label: "Nursing license", allCredentials: ["nursing-license"] }],
    retraining: { programId: "nurse-retraining-v1", title: "Complete nursing training", description: "Earn a nursing license through academic and supervised clinical study.", durationMonths: 30, costMoneyDelta: -12, grantsCredentials: ["nursing-license"] },
    pressureStory: { callbackId: "nurse-pressure-v1", title: "A crowded ward", prompt: "Several people need attention at once and your energy is fading. How do you respond?", supportRole: "charge nurse" },
    outfits: wardrobe("nurse", {
      label: "Layered nursing scrubs", top: "scrub top under a light clinical jacket", bottoms: "straight scrub trousers", footwear: "cushioned clinical shoes", accessories: ["watch pin", "hospital badge"], palette: ["#61B6B2", "#EEF8F2", "#315C6A"], sleeveStyle: "long",
    }, {
      label: "Summer nursing scrubs", top: "short-sleeve breathable scrub top", bottoms: "lightweight scrub trousers", footwear: "cushioned clinical shoes", accessories: ["watch pin", "hospital badge"], palette: ["#72CBC5", "#F7FFF9", "#427483"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "farmer",
    title: "Farmer",
    entryRoleTitle: "Working Farmer",
    qualifiedRoleTitle: "Farm Manager",
    summary: "Grow food and care for land through practical skill, patience, and changing seasons.",
    labels: {
      income: signal(2, "Income · Seasonal"),
      pressure: signal(3, "Pressure · Weather dependent"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Land and independence"),
    },
    economy: { salaryMoneyDelta: 8, recurringCostMoneyDelta: -5, healthDelta: 2, happinessDelta: 4 },
    qualificationPaths: [
      { pathId: "farmer-open-entry-v1", label: "Open practical entry" },
      { pathId: "farmer-training-v1", label: "Agriculture training", allCredentials: ["agriculture-training"] },
    ],
    retraining: null,
    pressureStory: { callbackId: "farmer-pressure-v1", title: "Weather on the horizon", prompt: "A storm could threaten the harvest, but everyone needs rest. What do you do?", supportRole: "neighboring farmer" },
    outfits: wardrobe("farmer", {
      label: "Field work layers", top: "durable overshirt over a cotton tee", bottoms: "reinforced work trousers", footwear: "weatherproof work boots", accessories: ["wide-brim hat", "work gloves"], palette: ["#557A46", "#D8A74E", "#76533A"], sleeveStyle: "long",
    }, {
      label: "Summer field outfit", top: "breathable short-sleeve work shirt", bottoms: "durable work shorts", footwear: "weatherproof work boots", accessories: ["wide-brim hat", "work gloves"], palette: ["#6B9858", "#EDC467", "#8A6548"], sleeveStyle: "short",
    }),
  },
  {
    careerId: "dancer",
    title: "Dancer",
    entryRoleTitle: "Company Dancer",
    qualifiedRoleTitle: "Principal Dancer",
    summary: "Tell stories through movement, discipline, performance, and collaboration.",
    labels: {
      income: signal(2, "Income · Project based"),
      pressure: signal(4, "Pressure · Physical and artistic"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Expressive purpose"),
    },
    economy: { salaryMoneyDelta: 8, recurringCostMoneyDelta: -5, healthDelta: -2, happinessDelta: 5 },
    qualificationPaths: [
      { pathId: "dancer-training-v1", label: "Dance training", allCredentials: ["dance-training"] },
      { pathId: "dancer-practice-v1", label: "Audition through sustained practice", allExperienceTags: ["creative-practice", "physical-training"] },
    ],
    retraining: { programId: "dancer-retraining-v1", title: "Join a dance conservatory", description: "Build technique and performance experience for a company audition.", durationMonths: 18, costMoneyDelta: -8, grantsCredentials: ["dance-training"] },
    pressureStory: { callbackId: "dancer-pressure-v1", title: "One more rehearsal", prompt: "A major performance is close, but fatigue is affecting the company. What do you do?", supportRole: "dance partner" },
    outfits: wardrobe("dancer", {
      label: "Studio warm-up layers", top: "fitted warm-up jacket over a rehearsal top", bottoms: "flexible dance trousers", footwear: "dance shoes", accessories: ["small rehearsal bag", "leg warmers"], palette: ["#8A4F8C", "#F0A6A6", "#3F4663"], sleeveStyle: "long",
    }, {
      label: "Summer rehearsal outfit", top: "breathable sleeveless rehearsal top", bottoms: "movement shorts or light dance skirt", footwear: "dance shoes", accessories: ["small rehearsal bag", "wrist bands"], palette: ["#A863AA", "#F7BCBC", "#566083"], sleeveStyle: "sleeveless",
    }),
  },
  {
    careerId: "gym-trainer",
    title: "Gym Trainer",
    entryRoleTitle: "Fitness Trainer",
    qualifiedRoleTitle: "Senior Fitness Coach",
    summary: "Help people build strength and confidence through safe, encouraging movement.",
    labels: {
      income: signal(3, "Income · Client based"),
      pressure: signal(2, "Pressure · Active schedule"),
      purposeAutonomy: signal(5, "Purpose / Autonomy · Coaching"),
    },
    economy: { salaryMoneyDelta: 9, recurringCostMoneyDelta: -5, healthDelta: 4, happinessDelta: 4 },
    qualificationPaths: [{ pathId: "trainer-certificate-v1", label: "Fitness certification", allCredentials: ["fitness-certification"] }],
    retraining: { programId: "trainer-retraining-v1", title: "Earn a fitness certification", description: "Learn safe programming, anatomy, and practical coaching.", durationMonths: 8, costMoneyDelta: -5, grantsCredentials: ["fitness-certification"] },
    pressureStory: { callbackId: "trainer-pressure-v1", title: "A packed client day", prompt: "Your schedule is full and one client needs extra support. How do you make room?", supportRole: "fellow trainer" },
    outfits: wardrobe("gym-trainer", {
      label: "Coaching tracksuit", top: "zip training jacket over a performance top", bottoms: "tapered athletic pants", footwear: "cross-training shoes", accessories: ["stopwatch", "small gym bag"], palette: ["#176B87", "#F38B4A", "#E8F3F1"], sleeveStyle: "long",
    }, {
      label: "Summer coaching kit", top: "breathable sleeveless performance top", bottoms: "training shorts", footwear: "cross-training shoes", accessories: ["stopwatch", "water bottle"], palette: ["#2287A6", "#F6A063", "#F7FFFC"], sleeveStyle: "sleeveless",
    }),
  },
  {
    careerId: "army",
    title: "Army Service Member",
    entryRoleTitle: "Army Specialist",
    qualifiedRoleTitle: "Army Team Leader",
    summary: "Serve through discipline, readiness, teamwork, and responsibility for others.",
    labels: {
      income: signal(3, "Income · Steady"),
      pressure: signal(5, "Pressure · Very high"),
      purposeAutonomy: signal(4, "Purpose / Autonomy · Service and team"),
    },
    economy: { salaryMoneyDelta: 10, recurringCostMoneyDelta: -4, healthDelta: -3, happinessDelta: 2 },
    qualificationPaths: [{ pathId: "army-training-v1", label: "Military training", allCredentials: ["military-training"] }],
    retraining: { programId: "army-retraining-v1", title: "Complete service training", description: "Build the fitness, discipline, and teamwork required for army service.", durationMonths: 9, costMoneyDelta: -3, grantsCredentials: ["military-training"] },
    pressureStory: { callbackId: "army-pressure-v1", title: "The difficult exercise", prompt: "Your unit is exhausted and the exercise is not finished. How do you lead your part?", supportRole: "unit teammate" },
    outfits: wardrobe("army", {
      label: "Field service uniform", top: "long-sleeve field jacket", bottoms: "reinforced field trousers", footwear: "lace-up field boots", accessories: ["service cap", "compact field pack"], palette: ["#596B45", "#8B7958", "#2F3A2C"], sleeveStyle: "long",
    }, {
      label: "Summer service uniform", top: "short-sleeve lightweight field shirt", bottoms: "lightweight field trousers", footwear: "lace-up field boots", accessories: ["service cap", "hydration pack"], palette: ["#708558", "#A08E69", "#3C4937"], sleeveStyle: "short",
    }),
  },
] as const satisfies readonly CareerDefinition[];

export function createCareerCatalog(
  definitions: readonly CareerDefinition[],
): CareerCatalog {
  const careers = {} as Record<CareerId, CareerDefinition>;
  const orderedCareerIds: CareerId[] = [];

  for (const definition of definitions) {
    if (careers[definition.careerId] !== undefined) {
      throw new Error(`Duplicate career ID: ${definition.careerId}`);
    }
    careers[definition.careerId] = deepFreeze({ ...definition });
    orderedCareerIds.push(definition.careerId);
  }

  return deepFreeze({
    catalogVersion: "career-catalog-v1" as const,
    careers,
    orderedCareerIds,
  });
}

export const DEFAULT_CAREER_DEFINITIONS: readonly CareerDefinition[] =
  deepFreeze([...DEFINITIONS]);

export const DEFAULT_CAREER_CATALOG = createCareerCatalog(
  DEFAULT_CAREER_DEFINITIONS,
);

export function getCareerDefinition(
  careerId: CareerId,
  catalog: CareerCatalog = DEFAULT_CAREER_CATALOG,
): CareerDefinition {
  const definition = catalog.careers[careerId];
  if (definition === undefined) {
    throw new RangeError(`Unknown career: ${careerId}`);
  }
  return definition;
}

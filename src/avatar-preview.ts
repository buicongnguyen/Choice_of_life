import {
  avatarLook,
  drawCharacter,
  drawPerson,
  personLook,
} from "./sprites";
import type { AvatarFacing } from "./sprites";
import {
  drawStorybookPet,
  warmStorybookPetAtlases,
  type PetFacing,
} from "./storybook-pets";
import {
  drawJobCharacter,
  isJobUniform,
  jobUniformHasSummer,
  warmJobCharacterAtlases,
  type JobArtSeason,
} from "./job-characters";
import {
  drawSummerCharacter,
  SUMMER_GENDERS,
  SUMMER_HERITAGES,
  warmSummerCharacterAtlases,
  type SummerFacing,
} from "./summer-characters";
import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
  JobUniform,
  PersonKind,
} from "./types";
import {
  PERSON_REACTION_SECONDS,
  interactionExpressionsAt,
} from "./character-interactions";

const maybeCanvas = document.getElementById("preview");
if (!(maybeCanvas instanceof HTMLCanvasElement)) {
  throw new Error("Avatar preview canvas is missing.");
}

const canvas = maybeCanvas;
const maybeCtx = canvas.getContext("2d");
if (!maybeCtx) {
  throw new Error("Avatar preview canvas context is missing.");
}

const ctx = maybeCtx;
const width = 1600;
const height = 1000;
const dpr = window.devicePixelRatio || 1;

canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);
ctx.imageSmoothingEnabled = true;

const stages = [
  "newborn",
  "toddler",
  "early",
  "elementary",
  "middle",
  "high",
  "university",
  "career",
  "marriage",
  "midlife",
  "senior",
  "retirement",
];
const searchParams = new URLSearchParams(location.search);
const requestedAppearance: CharacterAppearanceId =
  searchParams.get("variant") === "alternate"
    ? "alternate"
    : "classic";
const firstColumnX = 162;
const columnGap = 118;

function label(text: string, x: number, y: number, align: CanvasTextAlign = "center"): void {
  ctx.save();
  ctx.font = "18px Arial";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function lane(y: number, title: string): void {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(34, y - 132, width - 68, 164);
  label(title, 50, y - 154, "left");
}

function drawHeader(): void {
  ctx.fillStyle = "#7fd8ff";
  ctx.fillRect(0, 0, width, 72);
  ctx.fillStyle = "#172738";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Avatar Preview: life-stage body shapes, faces, and movement", 36, 42);
}

function drawPlayerRow(rowY: number, gender: Gender): void {
  stages.forEach((name, i) => {
    const x = firstColumnX + i * columnGap;
    if (rowY < 340) label(name, x, 98);
    drawCharacter(ctx, x, rowY, avatarLook(i, gender), i * 0.68, {
      moving: i > 0,
      facing: "front",
      verticalBias: 0,
    });
  });
}

function drawNpcRow(rowY: number): void {
  const people: PersonKind[] = [
    "mother",
    "father",
    "grandma",
    "grandpa",
    "sibling",
    "playmate",
    "studyFriend",
    "bestFriend",
    "crush",
    "coworker",
    "boss",
    "oldFriend",
  ];

  people.forEach((kind, i) => {
    const x = firstColumnX + i * columnGap;
    const stageIndex = kind === "grandma" || kind === "grandpa" || kind === "oldFriend" ? 10 : 7;
    drawCharacter(ctx, x, rowY, personLook(kind, "male", stageIndex), i * 0.7, {
      moving: i % 2 === 0,
      facing: "front",
      verticalBias: 0,
    });
    label(kind, x, rowY + 48);
  });
}

function drawMovementRow(rowY: number): void {
  const facings: AvatarFacing[] = ["left", "right", "back", "front"];
  stages.slice(1).forEach((name, i) => {
    const x = firstColumnX + i * columnGap;
    const facing = facings[i % facings.length];
    const gender: Gender = i % 3 === 0 ? "female" : "male";
    drawCharacter(ctx, x, rowY, avatarLook(i + 1, gender), 1.9 + i * 0.6, {
      moving: true,
      facing,
      verticalBias: facing === "back" ? -1 : facing === "front" ? 1 : 0,
    });
    label(`${name} ${facing}`, x, rowY + 48);
  });
}

// ?zoom draws a handful of figures at 3x so proportions and faces can be
// inspected closely; the default view is the full life-stage sheet.
// ?face renders heads only, at 8x, for reviewing facial features.
function renderFaces(): void {
  const scale = 8;
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);
  const faces: { look: ReturnType<typeof avatarLook>; facing: AvatarFacing; name: string }[] = location.search.includes("prof")
    ? [
        { look: avatarLook(7, "male"), facing: "right", name: "man R" },
        { look: avatarLook(7, "male"), facing: "left", name: "man L" },
        { look: avatarLook(7, "female"), facing: "back", name: "woman back" },
        { look: avatarLook(3, "male"), facing: "right", name: "boy R" },
      ]
    : [
        { look: avatarLook(7, "female"), facing: "front", name: "woman" },
        { look: avatarLook(7, "male"), facing: "front", name: "man" },
        { look: avatarLook(7, "female"), facing: "right", name: "woman side" },
        { look: avatarLook(7, "male"), facing: "back", name: "man back" },
      ];
  faces.forEach((f, i) => {
    drawCharacter(ctx, 28 + i * 48, 186, f.look, 0, { moving: false, facing: f.facing, verticalBias: 0 });
  });
  ctx.restore();
  faces.forEach((f, i) => label(f.name, (28 + i * 48) * scale, 58 * scale));
}

function renderZoom(): void {
  const scale = location.search.includes("side") ? 4.4 : 3;
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);
  const cases: { look: ReturnType<typeof avatarLook>; facing: AvatarFacing; name: string }[] = location.search.includes("side")
    ? [
        { look: avatarLook(7, "male"), facing: "right", name: "man side" },
        { look: avatarLook(7, "female"), facing: "right", name: "woman side" },
        { look: avatarLook(3, "male"), facing: "left", name: "boy side" },
      ]
    : location.search.includes("back")
    ? [
        { look: avatarLook(7, "male"), facing: "back", name: "man back" },
        { look: avatarLook(7, "female"), facing: "back", name: "woman back" },
        { look: avatarLook(11, "male"), facing: "front", name: "elder" },
        { look: avatarLook(1, "male"), facing: "front", name: "toddler" },
        { look: avatarLook(5, "male"), facing: "front", name: "teen boy" },
      ]
    : [
        { look: avatarLook(7, "male"), facing: "front", name: "man front" },
        { look: avatarLook(7, "female"), facing: "front", name: "woman front" },
        { look: avatarLook(7, "male"), facing: "right", name: "man side" },
        { look: avatarLook(5, "female"), facing: "front", name: "teen girl" },
        { look: avatarLook(3, "male"), facing: "front", name: "boy" },
      ];
  const footY = location.search.includes("side") ? 205 : 300;
  const step = location.search.includes("side") ? 115 : 100;
  const colX = (i: number): number => 62 + i * step;
  cases.forEach((c, i) => {
    drawCharacter(ctx, colX(i), footY, c.look, i * 0.9, { moving: i % 2 === 1, facing: c.facing, verticalBias: 0 });
  });
  ctx.restore();
  cases.forEach((c, i) => {
    label(c.name, colX(i) * scale, (footY + 20) * scale);
  });
}

function renderMatrix(): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawHeader();
  const heritages: { id: HeritageStyle; label: string }[] = [
    { id: "western", label: "Western" },
    { id: "asian", label: "Asian" },
    { id: "middleEastern", label: "Middle Eastern" },
    { id: "black", label: "Black / African diaspora" },
  ];
  const cases: {
    stage: number;
    gender: Gender;
    facing: AvatarFacing;
    moving: boolean;
    pose?: "stand" | "sit";
    label: string;
  }[] = [
    { stage: 0, gender: "female", facing: "right", moving: true, label: "girl · baby" },
    { stage: 3, gender: "male", facing: "left", moving: true, label: "boy · child" },
    { stage: 4, gender: "male", facing: "front", moving: false, label: "boy · middle" },
    { stage: 5, gender: "female", facing: "right", moving: true, label: "girl · high" },
    { stage: 6, gender: "female", facing: "front", moving: false, label: "woman · university" },
    { stage: 7, gender: "male", facing: "left", moving: true, label: "man · career" },
    { stage: 9, gender: "male", facing: "back", moving: false, label: "man · midlife" },
    { stage: 10, gender: "female", facing: "front", moving: false, label: "woman · elder" },
  ];

  heritages.forEach((heritage, row) => {
    const footY = 255 + row * 225;
    lane(footY, heritage.label);
    cases.forEach((entry, column) => {
      const x = 105 + column * 198;
      drawCharacter(ctx, x, footY, avatarLook(
        entry.stage,
        entry.gender,
        heritage.id,
        requestedAppearance
      ), column * 0.85, {
        moving: entry.moving,
        facing: entry.facing,
        verticalBias: 0,
        pose: entry.pose,
      });
      label(entry.label, x, footY + 42);
    });
  });
}

/**
 * Compare the two complete player/NPC identities without mixing gender sheets.
 * Use `?variants&stage=0..11` to inspect a particular life stage.
 */
function renderVariants(): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawHeader();
  const rawStageValue = searchParams.get("stage");
  const stageValue =
    rawStageValue === null ? Number.NaN : Number(rawStageValue);
  const stage =
    Number.isInteger(stageValue) &&
    stageValue >= 0 &&
    stageValue < stages.length
      ? stageValue
      : 5;
  const heritages: { id: HeritageStyle; label: string }[] = [
    { id: "western", label: "Western" },
    { id: "asian", label: "Asian" },
    { id: "middleEastern", label: "Middle Eastern" },
    { id: "black", label: "Black / African diaspora" },
  ];
  const entries: {
    gender: Gender;
    appearance: CharacterAppearanceId;
    facing: AvatarFacing;
  }[] = [];
  for (const gender of ["male", "female"] as const) {
    for (const appearance of ["classic", "alternate"] as const) {
      entries.push(
        { gender, appearance, facing: "front" },
        { gender, appearance, facing: "right" }
      );
    }
  }

  label(
    `Appearance comparison · ${stages[stage]} · male and female atlases remain separate`,
    width / 2,
    102
  );
  heritages.forEach((heritage, row) => {
    const footY = 260 + row * 220;
    lane(footY, heritage.label);
    entries.forEach((entry, column) => {
      const x = 110 + column * 195;
      drawCharacter(
        ctx,
        x,
        footY,
        avatarLook(
          stage,
          entry.gender,
          heritage.id,
          entry.appearance
        ),
        1.2,
        {
          moving: entry.facing !== "front",
          facing: entry.facing,
          verticalBias: 0,
        }
      );
      label(
        `${entry.gender === "female" ? "girl" : "boy"} · ${
          entry.appearance === "alternate" ? "new" : "classic"
        } · ${entry.facing}`,
        x,
        footY + 46
      );
    });
  });
}

function renderMotion(now: number): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawHeader();
  const heritages: { id: HeritageStyle; label: string }[] = [
    { id: "western", label: "Western" },
    { id: "asian", label: "Asian" },
    { id: "middleEastern", label: "Middle Eastern" },
    { id: "black", label: "Black / African diaspora" },
  ];
  const representativeStages = [0, 1, 4, 5, 6, 7, 9, 10];
  const requestedStageValue = new URLSearchParams(
    location.search
  ).get("stage");
  const requestedStage =
    requestedStageValue === null
      ? Number.NaN
      : Number(requestedStageValue);
  const fixedStage =
    Number.isInteger(requestedStage) &&
    requestedStage >= 0 &&
    requestedStage < stages.length
      ? requestedStage
      : null;
  const ageIndex = fixedStage === null
    ? Math.floor(now / 2600) % representativeStages.length
    : representativeStages.indexOf(fixedStage);
  const stage =
    fixedStage ?? representativeStages[ageIndex];
  const ageLabel = [
    "baby",
    "child",
    "early teen",
    "teen",
    "young adult",
    "adult",
    "middle age",
    "elder",
  ][ageIndex] ?? stages[stage];
  const facings: AvatarFacing[] = [
    "front",
    "left",
    "back",
    "right",
  ];
  const phase = now / 100;

  label(
    `Animated motion review · ${ageLabel} · male and female kept separate`,
    width / 2,
    102
  );
  heritages.forEach((heritage, row) => {
    const footY = 260 + row * 220;
    lane(footY, heritage.label);
    (["male", "female"] as const).forEach((gender, genderIndex) => {
      const groupStart = genderIndex === 0 ? 115 : 895;
      facings.forEach((facing, facingIndex) => {
        const x = groupStart + facingIndex * 145;
        drawCharacter(
          ctx,
          x,
          footY,
          avatarLook(
            stage,
            gender,
            heritage.id,
            requestedAppearance
          ),
          phase,
          { moving: true, facing, verticalBias: 0 }
        );
        label(`${gender} ${facing}`, x, footY + 46);
      });
      const seatedX = groupStart + 4 * 145;
      drawCharacter(
        ctx,
        seatedX,
        footY,
        avatarLook(
          stage,
          gender,
          heritage.id,
          requestedAppearance
        ),
        phase,
        {
          moving: false,
          facing: "front",
          verticalBias: 0,
          pose: "sit",
        }
      );
      label(`${gender} seated`, seatedX, footY + 46);
    });
  });
}

function renderPets(now: number): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#7fd8ff";
  ctx.fillRect(0, 0, width, 86);
  ctx.fillStyle = "#172738";
  ctx.font = "bold 29px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Pet Preview: four directions, two walk beats, and real sitting", 36, 34);
  ctx.font = "16px Arial";
  ctx.fillText(
    "Dog and cat are independent atlases · 1.8× inspection grid · animated samples at gameplay size",
    36,
    66
  );

  const facings: PetFacing[] = ["front", "left", "back", "right"];
  const states = [
    { label: "idle", moving: false, phase: 0, sitting: false },
    { label: "walk A", moving: true, phase: 0, sitting: false },
    { label: "walk B", moving: true, phase: Math.PI, sitting: false },
    { label: "seated", moving: false, phase: 0, sitting: true },
  ] as const;
  const species = [
    { kind: "dog", title: "Caramel puppy" },
    { kind: "cat", title: "Slate-blue kitten" },
  ] as const;
  const columnX = [215, 555, 895, 1235];

  species.forEach((entry, speciesIndex) => {
    const top = 112 + speciesIndex * 430;
    ctx.fillStyle =
      speciesIndex === 0
        ? "rgba(244,190,69,0.10)"
        : "rgba(127,216,255,0.09)";
    ctx.fillRect(34, top - 18, width - 68, 410);
    label(entry.title, 54, top, "left");

    facings.forEach((facing, column) => {
      label(facing, columnX[column], top + 28);
      states.forEach((state, row) => {
        const footY = top + 130 + row * 86;
        ctx.save();
        ctx.translate(columnX[column], footY);
        ctx.scale(1.8, 1.8);
        drawStorybookPet(ctx, 0, 0, entry.kind, {
          facing,
          moving: state.moving,
          phase: state.phase,
          sitting: state.sitting,
        });
        ctx.restore();
        if (column === 0) {
          label(state.label, 92, footY - 12, "left");
        }
      });
    });

    const animatedX = 1490;
    const animatedY = top + 116;
    drawStorybookPet(ctx, animatedX, animatedY, entry.kind, {
      facing: facings[Math.floor(now / 1800) % facings.length],
      moving: true,
      phase: now / 160,
    });
    label("1×", animatedX, animatedY + 42);
  });
}

const occupationLabels: Record<JobUniform, string> = {
  doctor: "Doctor · middle age",
  trainer: "Fitness trainer · adult",
  dancer: "Professional dancer · adult",
  soldier: "Army soldier · adult",
  farmer: "Farmer · middle age",
  teacher: "Teacher · adult",
  chef: "Chef · adult",
  barista: "Barista · adult",
  athlete: "Athlete · adult",
  entrepreneur: "Entrepreneur · adult",
  generalengineer: "General engineer · adult",
  softwareengineer: "Software engineer · adult",
  manager: "Manager · adult",
  analyst: "Financial analyst · adult",
  artist: "Artist · adult",
  police: "Police officer · adult",
  lawyer: "Lawyer · adult",
  ceo: "CEO · adult",
};

type OccupationPreviewFacing =
  | "front"
  | "left"
  | "back"
  | "right";
type OccupationPreviewPack =
  | "legacy"
  | "service"
  | "technical"
  | "leadership";

const occupationPreviewPacks: Record<
  OccupationPreviewPack,
  {
    label: string;
    uniforms: readonly JobUniform[];
  }
> = {
  legacy: {
    label: "Legacy professions",
    uniforms: [
      "doctor",
      "trainer",
      "dancer",
      "soldier",
      "farmer",
    ],
  },
  service: {
    label: "Service & creative",
    uniforms: [
      "teacher",
      "chef",
      "barista",
      "athlete",
      "artist",
    ],
  },
  technical: {
    label: "Technical & public service",
    uniforms: [
      "generalengineer",
      "softwareengineer",
      "police",
      "entrepreneur",
    ],
  },
  leadership: {
    label: "Business & leadership",
    uniforms: ["manager", "analyst", "lawyer", "ceo"],
  },
};

const occupationIdentities: {
  heritage: Extract<HeritageStyle, "western" | "asian">;
  gender: Gender;
  label: string;
}[] = [
  { heritage: "western", gender: "male", label: "Western male" },
  { heritage: "western", gender: "female", label: "Western female" },
  { heritage: "asian", gender: "male", label: "Asian male" },
  { heritage: "asian", gender: "female", label: "Asian female" },
];

function requestedOccupation(): JobUniform | null {
  const requested = searchParams.get("job");
  return requested && isJobUniform(requested)
    ? requested
    : null;
}

function requestedOccupationPack(): OccupationPreviewPack {
  const requested = searchParams.get("pack");
  return requested === "legacy" ||
    requested === "service" ||
    requested === "technical" ||
    requested === "leadership"
    ? requested
    : "service";
}

function requestedOccupationSeason(): JobArtSeason {
  return searchParams.get("season") === "summer"
    ? "summer"
    : "standard";
}

function effectiveOccupationSeason(
  uniform: JobUniform
): JobArtSeason {
  const requested = requestedOccupationSeason();
  return requested === "summer" &&
    jobUniformHasSummer(uniform)
    ? "summer"
    : "standard";
}

function occupationPreviewSeason(
  detail?: JobUniform
): JobArtSeason {
  if (detail) return effectiveOccupationSeason(detail);
  const pack = occupationPreviewPacks[
    requestedOccupationPack()
  ];
  return pack.uniforms.some(jobUniformHasSummer)
    ? requestedOccupationSeason()
    : "standard";
}

function drawOccupationPreviewHeader(
  detail?: JobUniform
): void {
  const pack = occupationPreviewPacks[
    requestedOccupationPack()
  ];
  const season = occupationPreviewSeason(detail);
  ctx.fillStyle =
    season === "summer" ? "#ffd07a" : "#7fd8ff";
  ctx.fillRect(0, 0, width, 92);
  ctx.fillStyle = "#172738";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 29px Arial";
  ctx.fillText(
    detail
      ? `Career outfit motion review · ${occupationLabels[detail]} · ${season}`
      : `Career outfit cast · ${pack.label} · ${season}`,
    36,
    34
  );
  ctx.font = "16px Arial";
  ctx.fillText(
    detail
      ? "Four neutral directions + four real walking poses · male and female remain separate"
      : `${pack.uniforms.length} reviewed jobs · Asian and Western adults · front neutral + walking sample`,
    36,
    68
  );
}

function renderOccupationOverview(now: number): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawOccupationPreviewHeader();
  const rowTop = 260;
  const rowGap = 175;

  occupationIdentities.forEach((identity, identityIndex) => {
    const groupX = 300 + identityIndex * 350;
    label(identity.label, groupX + 12, 112);
  });

  const pack = occupationPreviewPacks[
    requestedOccupationPack()
  ];
  pack.uniforms.forEach((uniform, row) => {
    const footY = rowTop + row * rowGap;
    label(occupationLabels[uniform], 30, footY - 76, "left");
    occupationIdentities.forEach((identity, identityIndex) => {
      const groupX = 300 + identityIndex * 350;
      const season = effectiveOccupationSeason(uniform);
      drawJobCharacter(
        ctx,
        groupX - 48,
        footY,
        uniform,
        identity.heritage,
        identity.gender,
        { facing: "front", size: 132, season }
      );
      drawJobCharacter(
        ctx,
        groupX + 72,
        footY,
        uniform,
        identity.heritage,
        identity.gender,
        {
          facing: "right",
          moving: true,
          phase: now / 170,
          size: 132,
          season,
        }
      );
    });
  });
}

function renderOccupationDetail(
  _now: number,
  uniform: JobUniform
): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawOccupationPreviewHeader(uniform);
  const facings: OccupationPreviewFacing[] = [
    "front",
    "left",
    "back",
    "right",
  ];
  const columnX = [
    125, 315, 505, 695, 895, 1085, 1275, 1465,
  ];
  const topLabels = [
    "front neutral",
    "left neutral",
    "back neutral",
    "right neutral",
    "front step",
    "left step",
    "back step",
    "right step",
  ];
  const season = effectiveOccupationSeason(uniform);
  topLabels.forEach((text, column) => {
    label(text, columnX[column], 118);
  });

  occupationIdentities.forEach((identity, row) => {
    const footY = 300 + row * 210;
    lane(footY, identity.label);
    facings.forEach((facing, column) => {
      drawJobCharacter(
        ctx,
        columnX[column],
        footY,
        uniform,
        identity.heritage,
        identity.gender,
        { facing, size: 148, season }
      );
      drawJobCharacter(
        ctx,
        columnX[column + 4],
        footY,
        uniform,
        identity.heritage,
        identity.gender,
        {
          facing,
          moving: true,
          phase: 1,
          size: 148,
          season,
        }
      );
    });
  });
}

function renderOccupations(now: number): void {
  const detail = requestedOccupation();
  if (detail) renderOccupationDetail(now, detail);
  else renderOccupationOverview(now);
}

async function warmRequestedOccupationPreview(): Promise<
  boolean
> {
  const detail = requestedOccupation();
  const uniforms = detail
    ? [detail]
    : occupationPreviewPacks[requestedOccupationPack()]
        .uniforms;
  const ready = await Promise.all(
    uniforms.map((uniform) =>
      warmJobCharacterAtlases(
        undefined,
        undefined,
        uniform,
        effectiveOccupationSeason(uniform)
      )
    )
  );
  return ready.every(Boolean);
}

const summerIdentityLabels: Record<
  HeritageStyle,
  string
> = {
  western: "Western",
  asian: "Asian",
  middleEastern: "Middle Eastern",
  black: "Black / African diaspora",
};

function requestedSummerIdentity(): {
  heritage: HeritageStyle;
  gender: Gender;
} | null {
  const heritage = searchParams.get("heritage");
  const gender = searchParams.get("gender");
  if (
    !SUMMER_HERITAGES.includes(
      heritage as HeritageStyle
    ) ||
    !SUMMER_GENDERS.includes(gender as Gender)
  ) {
    return null;
  }
  return {
    heritage: heritage as HeritageStyle,
    gender: gender as Gender,
  };
}

function drawSummerPreviewHeader(
  detail?: { heritage: HeritageStyle; gender: Gender }
): void {
  ctx.fillStyle = "#ffd76a";
  ctx.fillRect(0, 0, width, 92);
  ctx.fillStyle = "#2c2531";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 29px Arial";
  ctx.fillText(
    detail
      ? `Summer motion review · ${summerIdentityLabels[detail.heritage]} ${detail.gender}`
      : "Summer wardrobe · every heritage, male and female kept separate",
    36,
    34
  );
  ctx.font = "16px Arial";
  ctx.fillText(
    detail
      ? "Four neutral directions + four genuine walking poses · short sleeves and short summer bottoms"
      : "Eight reviewed warm-weather identities · neutral front + animated side step",
    36,
    68
  );
}

function renderSummerOverview(now: number): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawSummerPreviewHeader();
  SUMMER_GENDERS.forEach((gender, row) => {
    const footY = 390 + row * 390;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(34, footY - 205, width - 68, 238);
    label(
      gender === "male"
        ? "Male summer characters"
        : "Female summer characters",
      50,
      footY - 260,
      "left"
    );
    SUMMER_HERITAGES.forEach((heritage, column) => {
      const groupX = 235 + column * 380;
      label(
        summerIdentityLabels[heritage],
        groupX + 18,
        footY - 225
      );
      drawSummerCharacter(
        ctx,
        groupX - 58,
        footY,
        heritage,
        gender,
        { facing: "front", size: 184 }
      );
      drawSummerCharacter(
        ctx,
        groupX + 98,
        footY,
        heritage,
        gender,
        {
          facing: "right",
          moving: true,
          phase: now / 170,
          size: 184,
        }
      );
    });
  });
}

function renderSummerDetail(
  identity: { heritage: HeritageStyle; gender: Gender }
): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawSummerPreviewHeader(identity);
  const facings: SummerFacing[] = [
    "front",
    "left",
    "back",
    "right",
  ];
  const columnX = [
    125, 315, 505, 695, 895, 1085, 1275, 1465,
  ];
  const topLabels = [
    "front neutral",
    "left neutral",
    "back neutral",
    "right neutral",
    "front step",
    "left step",
    "back step",
    "right step",
  ];
  topLabels.forEach((text, column) => {
    label(text, columnX[column], 150);
  });
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(34, 520 - 132, width - 68, 164);
  facings.forEach((facing, column) => {
    drawSummerCharacter(
      ctx,
      columnX[column],
      520,
      identity.heritage,
      identity.gender,
      { facing, size: 188 }
    );
    drawSummerCharacter(
      ctx,
      columnX[column + 4],
      520,
      identity.heritage,
      identity.gender,
      {
        facing,
        moving: true,
        phase: 1,
        size: 188,
      }
    );
  });
}

function renderSummer(now: number): void {
  const detail = requestedSummerIdentity();
  if (detail) renderSummerDetail(detail);
  else renderSummerOverview(now);
}

function renderInteractions(now: number): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#7fd8ff";
  ctx.fillRect(0, 0, width, 86);
  ctx.fillStyle = "#172738";
  ctx.font = "bold 29px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "Interaction review: friendly reactions and distinct risky roles",
    36,
    34
  );
  ctx.font = "16px Arial";
  ctx.fillText(
    "Face-adjacent smile/talk cues are cosmetic · role styling never changes heritage or age",
    36,
    66
  );

  const heritages: { id: HeritageStyle; label: string }[] = [
    { id: "western", label: "Western" },
    { id: "asian", label: "Asian" },
    { id: "middleEastern", label: "Middle Eastern" },
    { id: "black", label: "Black / African diaspora" },
  ];
  const cases: {
    kind: PersonKind;
    title: string;
    stage: number;
  }[] = [
    {
      kind: "bestFriend",
      title: "Friendly conversation",
      stage: 5,
    },
    {
      kind: "smokerFriend",
      title: "Risky pressure",
      stage: 5,
    },
    {
      kind: "gangster",
      title: "Hostile crowd",
      stage: 5,
    },
    {
      kind: "playboy",
      title: "Flashy charmer",
      stage: 6,
    },
  ];
  const columnX = [215, 600, 985, 1370];
  const rawPhase = searchParams.get("phase");
  const requestedPhase =
    rawPhase === null ? Number.NaN : Number(rawPhase);
  const elapsed = Number.isFinite(requestedPhase)
    ? Math.max(
        0,
        Math.min(PERSON_REACTION_SECONDS, requestedPhase)
      )
    : (now / 1000) % PERSON_REACTION_SECONDS;

  cases.forEach((entry, column) => {
    label(entry.title, columnX[column], 116);
  });
  heritages.forEach((heritage, row) => {
    const footY = 275 + row * 220;
    lane(footY, heritage.label);
    cases.forEach((entry, column) => {
      const expressions = interactionExpressionsAt(
        elapsed,
        entry.kind
      );
      drawCharacter(
        ctx,
        columnX[column] - 52,
        footY,
        avatarLook(
          entry.stage,
          "female",
          heritage.id,
          requestedAppearance
        ),
        now / 1000,
        {
          moving: false,
          facing: "front",
          verticalBias: 0,
        },
        expressions.player
      );
      drawPerson(
        ctx,
        columnX[column] + 52,
        footY,
        entry.kind,
        "male",
        entry.kind === "bestFriend"
          ? "Best friend"
          : entry.kind === "smokerFriend"
            ? "Smoker friend"
            : entry.kind === "gangster"
              ? "Gangster"
              : "Playboy",
        false,
        false,
        now / 1000,
        entry.stage,
        heritage.id,
        {
          appearance: requestedAppearance,
          expression: expressions.npc,
        }
      );
    });
  });
}

function render(): void {
  if (location.search.includes("variants")) {
    renderVariants();
    return;
  }
  if (location.search.includes("matrix")) {
    renderMatrix();
    return;
  }
  if (location.search.includes("face")) {
    renderFaces();
    return;
  }
  if (location.search.includes("zoom")) {
    renderZoom();
    return;
  }
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawHeader();

  lane(280, "Boy / male player");
  drawPlayerRow(280, "male");

  lane(465, "Girl / female player");
  drawPlayerRow(465, "female");

  lane(665, "NPC people");
  drawNpcRow(665);

  lane(895, "Movement: left / right / back / front");
  drawMovementRow(895);
}

if (location.search.includes("interactions")) {
  const animate = (now: number): void => {
    renderInteractions(now);
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
} else if (location.search.includes("pets")) {
  void warmStorybookPetAtlases();
  const animate = (now: number): void => {
    renderPets(now);
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
} else if (location.search.includes("occupations")) {
  void warmRequestedOccupationPreview();
  const animate = (now: number): void => {
    renderOccupations(now);
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
} else if (location.search.includes("summer")) {
  void warmSummerCharacterAtlases();
  const animate = (now: number): void => {
    renderSummer(now);
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
} else if (location.search.includes("motion")) {
  const animate = (now: number): void => {
    renderMotion(now);
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
} else {
  render();
  window.addEventListener("plj:character-atlas-ready", render);
}

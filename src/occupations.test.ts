import { describe, expect, it } from "vitest";
import { OCCUPATIONS } from "./occupations";
import type { JobUniform } from "./types";

const EXPECTED_UNIFORMS: readonly JobUniform[] = [
  "doctor",
  "trainer",
  "dancer",
  "soldier",
  "farmer",
  "teacher",
  "chef",
  "barista",
  "athlete",
  "entrepreneur",
  "generalengineer",
  "softwareengineer",
  "manager",
  "analyst",
  "artist",
  "police",
  "lawyer",
  "ceo",
];

const EXPECTED_OCCUPATION_UNIFORMS: Record<string, JobUniform> = {
  artist: "artist",
  dancer: "dancer",
  farmer: "farmer",
  barista: "barista",
  athlete: "athlete",
  trainer: "trainer",
  trades: "generalengineer",
  soldier: "soldier",
  police: "police",
  chef: "chef",
  teacher: "teacher",
  nurse: "doctor",
  entrepreneur: "entrepreneur",
  jrdev: "softwareengineer",
  accountant: "analyst",
  analyst: "analyst",
  generalengineer: "generalengineer",
  engineer: "softwareengineer",
  manager: "manager",
  lawyer: "lawyer",
  staffeng: "softwareengineer",
  doctor: "doctor",
  ceo: "ceo",
};

const REQUESTED_CAREER_NAMES: Record<string, string> = {
  teacher: "Teacher",
  chef: "Chef",
  barista: "Barista",
  athlete: "Athlete",
  entrepreneur: "Entrepreneur",
  generalengineer: "Engineer",
  engineer: "Software Engineer",
  manager: "Manager",
  analyst: "Financial Analyst",
  artist: "Artist",
  police: "Police Officer",
  lawyer: "Lawyer",
  ceo: "CEO",
};

describe("occupation catalog", () => {
  it("keeps stable unique ids while adding three requested careers", () => {
    expect(OCCUPATIONS).toHaveLength(23);
    expect(
      new Set(OCCUPATIONS.map((occupation) => occupation.id)).size
    ).toBe(OCCUPATIONS.length);
    expect(
      Object.fromEntries(
        OCCUPATIONS.filter((occupation) =>
          Object.prototype.hasOwnProperty.call(
            REQUESTED_CAREER_NAMES,
            occupation.id
          )
        ).map((occupation) => [
          occupation.id,
          occupation.name,
        ])
      )
    ).toEqual(REQUESTED_CAREER_NAMES);
  });

  it("maps every occupation to one reviewed wardrobe", () => {
    expect(
      Object.fromEntries(
        OCCUPATIONS.map((occupation) => [
          occupation.id,
          occupation.uniform,
        ])
      )
    ).toEqual(EXPECTED_OCCUPATION_UNIFORMS);
  });

  it("retains five legacy and adds thirteen exact uniform families", () => {
    expect(
      [...new Set(OCCUPATIONS.map((occupation) => occupation.uniform))]
        .sort()
    ).toEqual([...EXPECTED_UNIFORMS].sort());
  });
});

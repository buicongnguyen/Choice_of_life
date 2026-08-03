import { validateCommittedFixturePreregistration } from "./fixture-lock.mjs";

const baseRevision = process.env.CHOICE_LOCK_BASE_SHA?.trim() || null;
const result = await validateCommittedFixturePreregistration(process.cwd(), { baseRevision });
console.log(JSON.stringify(result, null, 2));

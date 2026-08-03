import { validateFixturePreregistration } from "./fixture-lock.mjs";

const result = await validateFixturePreregistration();
console.log(JSON.stringify(result, null, 2));

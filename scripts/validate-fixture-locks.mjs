import { validateFixtureLocks } from "./fixture-lock.mjs";

const result = await validateFixtureLocks();
console.log(JSON.stringify(result, null, 2));

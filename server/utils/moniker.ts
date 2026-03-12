import fs from "node:fs";
import { resolveShard } from "./resolveShard.ts";

function readWordList(path: string) {
  return fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((word) => word.trim())
    .filter(Boolean);
}

let adjectives = readWordList(process.cwd() + "/words/adjectives.txt");
const nouns = readWordList(process.cwd() + "/words/nouns.txt");
const verbs = readWordList(process.cwd() + "/words/verbs.txt");
const randomElement = (array: string[]) =>
  array[Math.floor(Math.random() * array.length)];

export function makeRoomName(shard: number | undefined) {
  let filteredAdjectives = adjectives;
  if (shard) {
    // Filter the adjective list by shard
    filteredAdjectives = adjectives.filter(
      (adj) => resolveShard(adj) === Number(shard),
    );
  }
  const adjective = randomElement(filteredAdjectives);
  const noun = randomElement(nouns);
  const verb = randomElement(verbs);
  return `${adjective}-${noun}-${verb}`;
}

export function makeUserName() {
  return `${capFirst(randomElement(adjectives))} ${capFirst(
    randomElement(nouns),
  )}`;
}

function capFirst(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

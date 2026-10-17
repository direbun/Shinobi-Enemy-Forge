import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateEncounter, calculateEnemy } from "../model.mjs";

const rules = JSON.parse(fs.readFileSync(new URL("../data/rules.json", import.meta.url), "utf8"));

const baseEnemy = {
  level: 12,
  enemyClass: "Standard",
  rank: "C-Rank",
  role: "Generalist",
  playerCount: 4,
  armor: "Light",
  castingAbility: "Int",
  abilityOrder: ["Str", "Dex", "Con", "Int", "Wis", "Cha"],
  abilityAdjustments: { Str: 0, Dex: 0, Con: 0, Int: 0, Wis: 0, Cha: 0 },
  saveProficiencies: ["Dex", "Wis"],
  acAdjustment: 0,
  speedAdjustment: 0,
  hpMultiplier: 1,
  chakraMultiplier: 1,
};

test("official level 12 standard array and derived resources are preserved", () => {
  const result = calculateEnemy(rules, baseEnemy);
  assert.deepEqual(result.abilities, { Str: 4, Dex: 3, Con: 3, Int: 2, Wis: 0, Cha: -1 });
  assert.equal(result.proficiency, 6);
  assert.equal(result.hp, 166);
  assert.equal(result.chakra, 166);
  assert.equal(result.ac, 20);
  assert.equal(result.traitLimit, 3);
});

test("minions use the source sheet's compact hit-point rule", () => {
  const result = calculateEnemy(rules, { ...baseEnemy, level: 5, enemyClass: "Minion" });
  assert.equal(result.hp, 15);
  assert.equal(result.tenacity, 0);
});

test("TEL and REL reproduce the guide's four level-5 standards example", () => {
  const result = calculateEncounter(rules, [5, 5, 5, 5], [{ name: "Standard", level: 5, enemyClass: "Standard", classModTier: "None", count: 4 }]);
  assert.equal(result.tel, 20);
  assert.equal(result.rel, 5);
  assert.equal(result.difficulty, "Moderate");
});

test("level gaps and extra bodies alter relative encounter level", () => {
  const result = calculateEncounter(rules, [5, 5, 5, 5], [{ name: "Mob", level: 1, enemyClass: "Standard", classModTier: "None", count: 8 }]);
  assert.equal(result.crowdMultiplier, 2);
  assert.equal(result.tel, 4);
  assert.equal(result.rel, 2);
  assert.equal(result.difficulty, "Very Easy");
});

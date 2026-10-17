export const ABILITIES = ["Str", "Dex", "Con", "Int", "Wis", "Cha"];
export const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

export function clamp(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

export function signed(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : `${number}`;
}

export function levelRow(rules, level) {
  return rules.levels.find((row) => Number(row.level) === Number(level)) || rules.levels[3];
}

export function roleRow(rules, role) {
  return rules.roles.find((item) => item.name === role) || rules.roles.find((item) => item.name === "Generalist") || rules.roles[0];
}

export function rankRow(rules, rank) {
  return rules.ranks.find((item) => item.name === rank) || rules.ranks[2] || rules.ranks[0];
}

export function defaultEnemy(rules = null) {
  const role = rules?.roles?.find((item) => item.name === "Generalist")?.name || "Generalist";
  return {
    id: crypto.randomUUID(),
    name: "Unnamed adversary",
    concept: "",
    size: "Medium",
    level: 5,
    enemyClass: "Standard",
    rank: "C-Rank",
    role,
    clan: "Generic",
    affiliation: "Factionless",
    classModTier: "None",
    playerCount: 4,
    armor: "Light",
    castingAbility: "Int",
    abilityOrder: [...ABILITIES],
    abilityAdjustments: Object.fromEntries(ABILITIES.map((ability) => [ability, 0])),
    saveProficiencies: ["Dex", "Wis"],
    skillProficiencies: [],
    skillMasteries: [],
    skillMasteryRanks: {},
    traits: [],
    jutsu: [],
    weapons: [],
    customActions: [],
    speedAdjustment: 0,
    acAdjustment: 0,
    hpMultiplier: 1,
    chakraMultiplier: 1,
    damageReduction: 0,
    resistances: "",
    immunities: "",
    vulnerabilities: "",
    senses: "",
    languages: "",
    tactics: { opener: "", action: "", bonus: "", reaction: "", bloodied: "" },
    notes: "",
  };
}

export function calculateGuidelines(rules, enemy) {
  const calculated = calculateEnemy(rules, enemy);
  const level = calculated.level;
  const classBase = Math.max(0, Math.floor(level / 4 + 1));
  const tierJutsu = level >= 17 ? 4 : level >= 13 ? 2 : 0;
  const jutsuTarget = enemy.enemyClass === "Minion"
    ? classBase
    : classBase * 2 + tierJutsu + (["Elite", "Solo"].includes(enemy.enemyClass) ? classBase + 1 : 0);
  const masteryBudget = Math.max(0, Math.floor(level / 4));
  const masteryCap = 1 + (level >= 7 ? 1 : 0) + (level >= 12 ? 1 : 0);
  const masteryRanks = enemy.skillMasteryRanks || {};
  const masteryUsed = Object.values(masteryRanks).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const abilityPointsUsed = Object.values(enemy.abilityAdjustments || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return {
    proficientSkills: Math.max(0, calculated.proficiency),
    masteryBudget,
    masteryCap,
    masteryUsed,
    saveProficiencies: 2,
    jutsuTarget,
    maxJutsuRank: enemy.rank,
    traitTarget: calculated.traitLimit,
    attacksPerAction: calculated.attacks,
    abilityPointBudget: Math.max(0, Number(calculated.rank.bonusAbilityPoints || 0)),
    abilityPointsUsed,
  };
}

export function calculateEnemy(rules, enemy) {
  const level = clamp(enemy.level, -3, 30);
  const levelStats = levelRow(rules, level);
  const role = roleRow(rules, enemy.role);
  const rank = rankRow(rules, enemy.rank);
  const enemyClass = rules.classes.includes(enemy.enemyClass) ? enemy.enemyClass : "Standard";
  const baseArray = enemyClass === "Elite" || enemyClass === "Solo" ? levelStats.eliteArray : levelStats.standardArray;
  const abilities = {};
  const order = Array.isArray(enemy.abilityOrder) && enemy.abilityOrder.length === 6 ? enemy.abilityOrder : ABILITIES;
  order.forEach((ability, index) => {
    abilities[ability] = Number(baseArray[index] || 0) + Number(enemy.abilityAdjustments?.[ability] || 0);
  });
  ABILITIES.forEach((ability) => { if (!(ability in abilities)) abilities[ability] = Number(enemy.abilityAdjustments?.[ability] || 0); });

  const proficiency = Number(levelStats.proficiency || 0);
  const classHpBonus = enemyClass === "Elite" ? 1 : enemyClass === "Solo" ? 0.75 * clamp(enemy.playerCount, 1, 12) : enemyClass === "Minion" ? 0.0001 : 0;
  const hp = enemyClass === "Minion"
    ? Math.max(1, 10 + level)
    : Math.max(1, Math.floor((10 + abilities.Con * level + Number(rank.hitDieAverage || 0) * level * (1 + Number(role.hp || 0) + classHpBonus)) * Number(enemy.hpMultiplier || 1)));
  const chakra = Math.max(0, Math.floor((10 + abilities.Con * level + Number(rank.chakraDieAverage || 0) * level * (1 + Number(role.chakra || 0) + classHpBonus)) * Number(enemy.chakraMultiplier || 1)));
  const armorBonus = enemy.armor === "Heavy" ? 6
    : enemy.armor === "Medium" ? 4 + Math.floor(abilities.Dex / 2)
      : enemy.armor === "Caster" ? 1 + Number(abilities[enemy.castingAbility] || 0)
        : 1 + abilities.Dex;
  const tierBonus = level < 7 ? 0 : level < 11 ? 1 : level < 14 ? 2 : level < 17 ? 3 : 4;
  const classAc = enemyClass === "Minion" ? -2 : enemyClass === "Elite" ? 2 : enemyClass === "Solo" ? 4 : 0;
  const ac = Math.max(1, 10 + Math.ceil(level / 4) + armorBonus + tierBonus + classAc + Number(role.ac || 0) + Number(enemy.acAdjustment || 0));
  const speed = 30 + Number(role.speed || 0) + Number(enemy.speedAdjustment || 0);
  const tenacity = enemyClass === "Solo" ? Math.max(0, Math.floor(level)) : enemyClass === "Elite" ? Math.max(0, Math.floor(level * 0.5)) : 0;
  const attackBonus = Number(levelStats.attackBonus || 0) + Number(rank.toHitBonus || 0);
  const saveDcs = Object.fromEntries(["Ninjutsu", "Genjutsu", "Taijutsu"].map((discipline) => {
    const ability = discipline === "Genjutsu" ? "Wis" : discipline === "Taijutsu" ? "Dex" : enemy.castingAbility;
    return [discipline, { ability, attack: proficiency + abilities[ability] + Number(rank.toHitBonus || 0), dc: 8 + proficiency + abilities[ability] + Number(rank.saveDcBonus || 0) }];
  }));
  const saves = Object.fromEntries(ABILITIES.map((ability) => [ability, abilities[ability] + (enemy.saveProficiencies?.includes(ability) ? proficiency : Math.floor(proficiency / 2)) + Number(role.save || 0)]));
  const traitLimit = Number(levelStats.traitLimits?.[enemyClass] || 0);
  const damagePerAction = Math.max(1, Math.round(Number(levelStats.damagePerAction || 1) * Number(role.damage || 1) + Number(rank.bonusDamage || 0)));
  const attacks = level >= 30 ? 6 : level >= 25 ? 5 : level >= 15 ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : 1;
  return { level, levelStats, role, rank, abilities, proficiency, hp, chakra, ac, speed, tenacity, attackBonus, saveDcs, saves, traitLimit, damagePerAction, attacks };
}

export function calculateEncounter(rules, partyLevels, entries) {
  const levels = partyLevels.map(Number).filter((level) => Number.isFinite(level) && level > 0);
  const partySize = Math.max(1, levels.length);
  const pal = levels.reduce((sum, level) => sum + level, 0) / partySize;
  let enemyCount = 0;
  let tel = 0;
  for (const entry of entries) {
    const count = clamp(entry.count ?? 1, 1, 99);
    const level = clamp(entry.level, -3, 30);
    const classWeight = Number(rules.encounterRules.classWeights[entry.enemyClass] ?? 1);
    const classModBonus = Number(rules.encounterRules.classModLevelBonuses[entry.classModTier || "None"] ?? 0);
    const effectiveLevel = level + classModBonus;
    const relativeFactor = effectiveLevel >= pal + 4 ? 2 : effectiveLevel <= pal - 4 ? 0.5 : 1;
    tel += effectiveLevel * classWeight * relativeFactor * count;
    enemyCount += count;
  }
  const excess = Math.max(0, enemyCount - partySize);
  const crowdMultiplier = 1 + Math.floor(excess / 2) * 0.5;
  const rel = (tel * crowdMultiplier) / partySize;
  const delta = rel - pal;
  const difficulty = delta <= -3 ? "Very Easy" : delta <= -2 ? "Easy" : delta <= 1 ? "Moderate" : delta <= 2 ? "Hard" : "Deadly";
  return { partySize, pal, enemyCount, tel, crowdMultiplier, rel, delta, difficulty };
}

export function validateEnemy(rules, enemy) {
  const calculated = calculateEnemy(rules, enemy);
  const guidance = calculateGuidelines(rules, enemy);
  const warnings = [];
  if (!enemy.name?.trim() || enemy.name === "Unnamed adversary") warnings.push("Give the adversary a name.");
  if ((enemy.traits?.length || 0) > calculated.traitLimit) warnings.push(`Selected traits exceed the suggested limit by ${enemy.traits.length - calculated.traitLimit}.`);
  const hasAction = (enemy.jutsu || []).some((id) => {
    const item = rules.jutsu.find((jutsu) => jutsu.id === id);
    return item && /action/i.test(item.castingTime) && !/bonus|reaction/i.test(item.castingTime);
  }) || (enemy.weapons?.length || 0) > 0 || (enemy.customActions?.length || 0) > 0;
  const hasBonus = (enemy.jutsu || []).some((id) => /bonus action/i.test(rules.jutsu.find((jutsu) => jutsu.id === id)?.castingTime || ""));
  const hasReaction = (enemy.jutsu || []).some((id) => /reaction/i.test(rules.jutsu.find((jutsu) => jutsu.id === id)?.castingTime || ""));
  if (!hasAction) warnings.push("Add a reliable action, weapon, or offensive jutsu.");
  if (!hasBonus) warnings.push("The Kage Guide recommends a usable bonus action.");
  if (!hasReaction) warnings.push("The Kage Guide recommends a reaction the party can trigger.");
  if ((enemy.skillProficiencies?.length || 0) < guidance.proficientSkills) warnings.push(`The sheet suggests ${guidance.proficientSkills} proficient skills; ${enemy.skillProficiencies?.length || 0} selected.`);
  if ((enemy.jutsu?.length || 0) < guidance.jutsuTarget) warnings.push(`The sheet suggests about ${guidance.jutsuTarget} jutsu for this level and class; ${enemy.jutsu?.length || 0} selected.`);
  return warnings;
}

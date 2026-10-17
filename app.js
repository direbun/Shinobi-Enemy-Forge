import { ABILITIES, RANK_ORDER, calculateEncounter, calculateEnemy, calculateGuidelines, defaultEnemy, signed, validateEnemy } from "./model.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const numberFields = new Set(["level", "playerCount", "acAdjustment", "speedAdjustment", "damageReduction", "hpMultiplier", "chakraMultiplier"]);
const STORAGE_KEY = "threat-forge-v1";
const pageCopy = {
  forge: ["Build the threat", "Set the enemy’s job, scale, and identity."],
  abilities: ["Shape the stat line", "Assign the official array and train the saves that matter."],
  traits: ["Choose defining traits", "Build around a clear job before adding secondary tricks."],
  jutsu: ["Plan the whole turn", "Cover actions, bonus actions, and reactions without burying the GM."],
  arsenal: ["Equip the adversary", "Choose weapons and write the few custom actions the fight needs."],
  tactics: ["Write the combat plan", "Turn mechanics into decisions you can run quickly."],
  statblock: ["Run the enemy", "Review warnings and use the print-ready statblock at the table."],
  encounter: ["Balance the opposition", "Compare Relative Encounter Level against the party’s PAL."],
};
const stepOrder = Object.keys(pageCopy);
const roleAdvice = {
  "Generalist": "Flexible and dependable. Fill gaps in an enemy team without over-specializing.",
  "Caster (Ninjutsu)": "Ranged chakra specialist. Protect it from pressure and give it a dependable bonus action.",
  "Caster (Genjutsu)": "Mental pressure and deception. Pair control with a concrete follow-up plan.",
  "Caster (Taijutsu)": "Technique-driven close combatant with more stamina than other casters.",
  "Controller": "Shapes positioning and denies actions. Its allies should exploit the openings it creates.",
  "Defender": "Absorbs attention, protects allies, and makes movement costly.",
  "Lurker": "Bursts from concealment, then relocates. Avoid leaving it in a fair stand-up fight.",
  "Striker (Ninjutsu)": "Mobile single-target damage dealer with ranged technique support.",
  "Striker (Genjutsu)": "Aggressive mental duelist that focuses one exposed target.",
  "Striker (Taijutsu)": "Fast melee damage dealer. Use movement and chains to stay on one target.",
  "Supporter": "Improves allies through healing, protection, buffs, and coordinated actions.",
};

let rules;
let state;

function safeArray(value) { return Array.isArray(value) ? value : []; }
function hydrateEnemy(raw = {}) {
  const fresh = defaultEnemy(rules);
  const enemy = { ...fresh, ...raw };
  enemy.tactics = { ...fresh.tactics, ...(raw.tactics || {}) };
  enemy.abilityAdjustments = { ...fresh.abilityAdjustments, ...(raw.abilityAdjustments || {}) };
  enemy.skillMasteryRanks = { ...fresh.skillMasteryRanks, ...(raw.skillMasteryRanks || {}) };
  enemy.abilityOrder = safeArray(raw.abilityOrder).length === 6 ? [...raw.abilityOrder] : fresh.abilityOrder;
  for (const key of ["saveProficiencies", "skillProficiencies", "skillMasteries", "traits", "jutsu", "weapons", "customActions"]) enemy[key] = safeArray(raw[key]);
  for (const skill of enemy.skillMasteries) if (!enemy.skillMasteryRanks[skill]) enemy.skillMasteryRanks[skill] = 1;
  return enemy;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) return {
      enemy: hydrateEnemy(saved.enemy),
      roster: safeArray(saved.roster).map(hydrateEnemy),
      encounter: { partyLevels: safeArray(saved.encounter?.partyLevels).length ? saved.encounter.partyLevels : [5, 5, 5, 5], entries: safeArray(saved.encounter?.entries) },
      step: saved.step || "forge",
    };
  } catch (error) { console.warn("Could not read saved state", error); }
  return { enemy: defaultEnemy(rules), roster: [], encounter: { partyLevels: [5, 5, 5, 5], entries: [] }, step: "forge" };
}

function persist(message = "Autosaved locally") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  $("#save-status").textContent = message;
}

function options(values, selected) {
  return values.map((value) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(value)}</option>`).join("");
}

function populateStaticOptions() {
  $("#class-select").innerHTML = options(rules.classes, state.enemy.enemyClass);
  $("#role-select").innerHTML = options(rules.roles.map((role) => role.name), state.enemy.role);
  $("#rank-select").innerHTML = options(rules.ranks.map((rank) => rank.name), state.enemy.rank);
  $("#clan-select").innerHTML = options(["Generic", ...rules.lists.clans.filter((value) => value !== "Generic")], state.enemy.clan);
  $("#affiliation-select").innerHTML = options(["Factionless", ...rules.lists.affiliations.filter((value) => value !== "Factionless")], state.enemy.affiliation);
  const ranks = [...new Set(rules.traits.map((trait) => trait.rank).filter(Boolean))];
  $("#trait-rank").insertAdjacentHTML("beforeend", options(ranks, ""));
  $("#jutsu-rank").insertAdjacentHTML("beforeend", options(RANK_ORDER, ""));
  const disciplines = [...new Set(rules.jutsu.map((jutsu) => jutsu.discipline).filter(Boolean))].sort();
  $("#jutsu-discipline").insertAdjacentHTML("beforeend", options(disciplines, ""));
  const categories = [...new Set(rules.traits.flatMap((trait) => String(trait.categories || "").split(",").map((value) => value.trim())).filter(Boolean))].sort();
  $("#trait-category").insertAdjacentHTML("beforeend", options(categories, ""));
  const groups = [...new Set(rules.weapons.flatMap((weapon) => String(weapon.group || "").split("/").map((value) => value.trim())).filter(Boolean))].sort();
  $("#weapon-group").insertAdjacentHTML("beforeend", options(groups, ""));
}

function syncForm() {
  $$('[data-field]').forEach((element) => {
    const value = state.enemy[element.dataset.field];
    if (value !== undefined) element.value = value;
  });
  $$('[data-tactic]').forEach((element) => { element.value = state.enemy.tactics[element.dataset.tactic] || ""; });
}

function setStep(step) {
  state.step = pageCopy[step] ? step : "forge";
  $$(".nav-step").forEach((button) => button.classList.toggle("active", button.dataset.step === state.step));
  $$(".step-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === state.step));
  $("#page-title").textContent = pageCopy[state.step][0];
  $("#page-subtitle").textContent = pageCopy[state.step][1];
  renderGuide();
  if (state.step === "statblock") renderStatblock();
  if (state.step === "encounter") renderEncounter();
  persist();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function commit(message) {
  persist(message);
  renderSummary();
  renderGuide();
  renderCore();
  renderAbilities();
  renderTraits();
  renderJutsu();
  renderWeapons();
  renderCustomActions();
  renderStatblock();
  renderEncounter();
}

function renderSummary() {
  const calc = calculateEnemy(rules, state.enemy);
  $("#sidebar-name").textContent = state.enemy.name || "Unnamed adversary";
  $("#sidebar-build").textContent = `${state.enemy.enemyClass} · ${state.enemy.role}`;
  $("#sidebar-level").textContent = calc.level;
  $("#enemy-avatar").textContent = (state.enemy.name || "?").trim().slice(0, 1).toUpperCase() || "?";
  $("#hero-damage").textContent = calc.damagePerAction;
}

function guideCard(label, value, note, stateClass = "") {
  return `<article class="guide-card ${stateClass}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function recommendedWeaponText(role) {
  if (/Lurker/.test(role)) return "Light or Critical";
  if (/Defender/.test(role)) return "Blocking or Trip";
  if (/Striker/.test(role)) return "Heavy or Versatile";
  if (/Caster|Controller|Supporter/.test(role)) return "Ranged";
  return "Any weapon that fits";
}

function buildCompletion(guidance) {
  const coverage = actionCoverage();
  return {
    forge: Boolean(state.enemy.name?.trim() && state.enemy.name !== "Unnamed adversary"),
    abilities: state.enemy.saveProficiencies.length >= guidance.saveProficiencies && state.enemy.skillProficiencies.length >= guidance.proficientSkills,
    traits: state.enemy.traits.length >= Math.min(1, guidance.traitTarget),
    jutsu: Boolean(coverage.action && state.enemy.jutsu.length >= guidance.jutsuTarget),
    arsenal: Boolean(coverage.action),
    tactics: Boolean(state.enemy.tactics.action && state.enemy.tactics.reaction),
    statblock: validateEnemy(rules, state.enemy).length === 0,
    encounter: state.encounter.entries.length > 0,
  };
}

function renderGuide() {
  if (!state || !rules) return;
  const calc = calculateEnemy(rules, state.enemy);
  const guidance = calculateGuidelines(rules, state.enemy);
  const coverage = actionCoverage();
  const completion = buildCompletion(guidance);
  $$(".nav-step").forEach((button) => {
    button.classList.toggle("done", Boolean(completion[button.dataset.step]));
    button.setAttribute("aria-label", `${button.textContent.trim()}${completion[button.dataset.step] ? ", recommendation met" : ""}`);
  });
  const index = stepOrder.indexOf(state.step);
  $("#step-position").textContent = `Step ${index + 1} of ${stepOrder.length} · ${Object.values(completion).filter(Boolean).length} recommendations met`;
  $("#previous-step").disabled = index <= 0;
  $("#next-step").disabled = index >= stepOrder.length - 1;
  $("#next-step").textContent = index === stepOrder.length - 1 ? "Finished" : "Next step →";

  const guides = {
    forge: ["Choose the enemy's job", "Set role, class, rank, and level first. Everything below recalculates immediately.", [
      ["Role", state.enemy.role, "What it contributes to the team"],
      ["Class", state.enemy.enemyClass, "Durability and encounter weight"],
      ["Rank", state.enemy.rank, "Dice and rank modifiers"],
    ]],
    abilities: ["Spend training where it matters", "Use the array for identity, then spend the suggested training budget. Going over is allowed and visibly flagged.", [
      ["Full saves", `${state.enemy.saveProficiencies.length} / ${guidance.saveProficiencies}`, "Practical starting suggestion"],
      ["Proficient skills", `${state.enemy.skillProficiencies.length} / ${guidance.proficientSkills}`, "Sheet target = proficiency bonus"],
      ["Mastery points", `${guidance.masteryUsed} / ${guidance.masteryBudget}`, `Maximum ${guidance.masteryCap} on one skill`],
    ]],
    traits: ["Build the role before adding tricks", "Pick one or two defining traits first. Remaining suggested slots can solve a secondary need.", [
      ["Trait slots", `${state.enemy.traits.length} / ${guidance.traitTarget}`, "Official level/class target"],
      ["Primary-role traits", "1–2", "Guide recommendation"],
      ["Freedom", "Overrides allowed", "Counters warn but never block"],
    ]],
    jutsu: ["Give every turn a simple plan", "Meet the suggested total, but prioritize a dependable action, useful bonus action, and player-triggered reaction.", [
      ["Jutsu known", `${state.enemy.jutsu.length} / ${guidance.jutsuTarget}`, "Sheet level/class target"],
      ["Suggested ceiling", guidance.maxJutsuRank, "Higher ranks remain selectable"],
      ["Turn coverage", `${Object.values(coverage).filter(Boolean).length} / 3`, "Action · bonus · reaction"],
    ]],
    arsenal: ["Choose one dependable fallback", "A weapon or custom action keeps the enemy runnable when jutsu are unavailable.", [
      ["Role suggests", recommendedWeaponText(state.enemy.role), "Soft weapon guidance"],
      ["Attacks", `${calc.attacks} / action`, "Expected at this level"],
      ["Damage target", `${calc.damagePerAction}`, "Suggested total per action"],
    ]],
    tactics: ["Write decisions, not lore", "One sentence in each box is enough. The default action and reaction trigger do the most work at the table.", [
      ["Opening move", state.enemy.tactics.opener ? "Written" : "Not written", "How the fight begins"],
      ["Default turn", state.enemy.tactics.action ? "Written" : "Not written", "What happens most rounds"],
      ["Reaction trigger", state.enemy.tactics.reaction ? "Written" : "Not written", "What players can trigger"],
    ]],
    statblock: ["Resolve only the warnings that matter", "Warnings compare the build with source guidance; none of them prevent printing or play.", [
      ["Warnings", validateEnemy(rules, state.enemy).length, "Advisory checks remaining"],
      ["Damage / action", calc.damagePerAction, "Use when writing custom attacks"],
      ["Attacks / action", calc.attacks, "Expected multiattack count"],
    ]],
    encounter: ["Check the whole fight", "Add enemies, enter each character level, and compare REL with PAL. Aim near Moderate unless you want a deliberate spike.", [
      ["Party members", state.encounter.partyLevels.length, "Used to calculate PAL"],
      ["Enemy entries", state.encounter.entries.length, "Used to calculate TEL"],
      ["Current weight", state.enemy.enemyClass, "Minion ½ · Standard 1 · Elite 2 · Solo 4"],
    ]],
  };
  const [title, copy, targets] = guides[state.step];
  $("#compass-title").textContent = title;
  $("#compass-copy").textContent = copy;
  $("#compass-targets").innerHTML = targets.map(([label, value, note]) => guideCard(label, value, note)).join("");
  $("#loadout-roadmap").innerHTML = [
    guideCard("Full saves", guidance.saveProficiencies, "Practical starting point"),
    guideCard("Proficient skills", guidance.proficientSkills, "Equals proficiency bonus"),
    guideCard("Mastery points", guidance.masteryBudget, `Up to ${guidance.masteryCap} per skill`),
    guideCard("Traits", guidance.traitTarget, "Level/class target"),
    guideCard("Jutsu", guidance.jutsuTarget, `${guidance.maxJutsuRank} or lower suggested`),
    guideCard("Attacks", calc.attacks, `${calc.damagePerAction} total damage/action`),
  ].join("");

  const abilityBudgetState = guidance.abilityPointsUsed > guidance.abilityPointBudget ? "over" : "";
  $("#ability-guidance").innerHTML = [
    guideCard("Rank adjustment points", `${guidance.abilityPointsUsed} / ${guidance.abilityPointBudget}`, "Positive manual adjustments used", abilityBudgetState),
    guideCard("Full save proficiencies", `${state.enemy.saveProficiencies.length} / ${guidance.saveProficiencies}`, "Start with two; choose the saves central to the concept"),
    guideCard("Skill training", `${state.enemy.skillProficiencies.length} / ${guidance.proficientSkills}`, "Recommended proficient skills"),
    guideCard("Mastery", `${guidance.masteryUsed} / ${guidance.masteryBudget}`, `Spend up to ${guidance.masteryCap} on one skill`, guidance.masteryUsed > guidance.masteryBudget ? "over" : ""),
  ].join("");
  $("#save-budget").innerHTML = `<strong>${state.enemy.saveProficiencies.length} / ${guidance.saveProficiencies}</strong><span>suggested</span>`;
  $("#skill-budget").innerHTML = `<strong>${state.enemy.skillProficiencies.length} / ${guidance.proficientSkills}</strong><span>proficient</span><strong>${guidance.masteryUsed} / ${guidance.masteryBudget}</strong><span>mastery points</span>`;
  $("#jutsu-guidance").innerHTML = [
    guideCard("Jutsu known", `${state.enemy.jutsu.length} / ${guidance.jutsuTarget}`, "Recommended total; more are still allowed", state.enemy.jutsu.length > guidance.jutsuTarget ? "over" : ""),
    guideCard("Rank guidance", `${guidance.maxJutsuRank} or lower`, "Higher-ranked techniques remain available"),
    guideCard("Action economy", `${Object.values(coverage).filter(Boolean).length} / 3`, "Cover action, bonus action, and reaction"),
  ].join("");
  $("#arsenal-guidance").innerHTML = [
    guideCard("Weapon style", recommendedWeaponText(state.enemy.role), `Suggested for ${state.enemy.role}`),
    guideCard("Expected multiattack", calc.attacks, "Attacks made when using the standard attack action"),
    guideCard("Damage budget", calc.damagePerAction, "Total suggested damage across the action"),
  ].join("");
  $("#tactics-guidance").innerHTML = [
    guideCard("Opener", state.enemy.tactics.opener ? "Ready" : "Write one", "Positioning or setup"),
    guideCard("Default action", state.enemy.tactics.action ? "Ready" : "Write one", "Reliable turn plan"),
    guideCard("Reaction", state.enemy.tactics.reaction ? "Ready" : "Write one", "A trigger players can cause"),
  ].join("");
}

function renderCore() {
  const calc = calculateEnemy(rules, state.enemy);
  const chips = [
    ["Armor class", calc.ac], ["Hit points", calc.hp], ["Chakra", calc.chakra], ["Proficiency", signed(calc.proficiency)],
    ["Speed", `${calc.speed} ft`], ["Tenacity", calc.tenacity], ["Traits", `${state.enemy.traits.length}/${calc.traitLimit}`],
  ];
  $("#core-stat-strip").innerHTML = chips.map(([label, value]) => `<div class="stat-chip"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("");
  const role = roleAdvice[state.enemy.role] || "Use this role to decide what the enemy should accomplish for its team.";
  const classText = state.enemy.enemyClass === "Minion" ? "Minions are fragile and contribute half their level to TEL."
    : state.enemy.enemyClass === "Elite" ? "Elites have double encounter weight, phase gates, and Tenacity."
      : state.enemy.enemyClass === "Solo" ? "Solos have quadruple encounter weight and scale their durability with party size."
        : "Standards are the baseline enemy and contribute their full level to TEL.";
  $("#role-advice").innerHTML = [
    [state.enemy.role, role],
    [state.enemy.enemyClass, classText],
    [state.enemy.rank, `${calc.rank.hitDie} hit die · ${calc.rank.chakraDie} chakra die · ${signed(calc.rank.toHitBonus)} rank attack modifier.`],
  ].map(([title, text]) => `<article class="advice-card"><strong>${esc(title)}</strong><p>${esc(text)}</p></article>`).join("");
}

function renderAbilities() {
  const calc = calculateEnemy(rules, state.enemy);
  const guidance = calculateGuidelines(rules, state.enemy);
  const array = state.enemy.enemyClass === "Elite" || state.enemy.enemyClass === "Solo" ? calc.levelStats.eliteArray : calc.levelStats.standardArray;
  $("#ability-array").innerHTML = array.map((base, index) => {
    const ability = state.enemy.abilityOrder[index];
    return `<div class="ability-card"><small>Array slot ${index + 1}</small><strong>${signed(calc.abilities[ability])}</strong><label>Assign ${signed(base)}<select data-array-slot="${index}">${options(ABILITIES, ability)}</select></label><label>Adjustment<input data-adjust="${ability}" type="number" value="${Number(state.enemy.abilityAdjustments[ability] || 0)}"></label></div>`;
  }).join("");
  $("#save-training").innerHTML = ABILITIES.map((ability) => `<label class="toggle"><span>${ability} <small>${signed(calc.saves[ability])}</small></span><input data-save-prof="${ability}" type="checkbox"${state.enemy.saveProficiencies.includes(ability) ? " checked" : ""}></label>`).join("");
  const search = ($("#skill-search")?.value || "").toLowerCase();
  $("#skill-grid").innerHTML = rules.skills.filter((skill) => skill.name.toLowerCase().includes(search)).map((skill) => {
    const proficient = state.enemy.skillProficiencies.includes(skill.name);
    const mastery = Math.max(0, Number(state.enemy.skillMasteryRanks[skill.name] || 0));
    return `<div class="skill-toggle"><div><strong>${esc(skill.name)}</strong><small>${esc(skill.ability)} · ${proficient ? `+${calc.proficiency} proficiency` : "untrained"}${mastery ? ` · +${mastery * 2} mastery` : ""}</small></div><label>Prof <input data-skill-prof="${esc(skill.name)}" type="checkbox"${proficient ? " checked" : ""}></label><label>Mastery <select data-skill-mastery="${esc(skill.name)}">${Array.from({ length: guidance.masteryCap + 1 }, (_, rank) => `<option value="${rank}"${rank === mastery ? " selected" : ""}>${rank}</option>`).join("")}</select></label></div>`;
  }).join("");
}

function filteredTraits() {
  const search = $("#trait-search").value.trim().toLowerCase();
  const rank = $("#trait-rank").value;
  const category = $("#trait-category").value;
  return rules.traits.filter((trait) => {
    const haystack = `${trait.name} ${trait.description} ${trait.source} ${trait.categories}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!rank || trait.rank === rank) && (!category || String(trait.categories).includes(category));
  }).sort((a, b) => {
    const aRelevant = ["Generic", state.enemy.role, state.enemy.clan, state.enemy.affiliation].includes(a.source) ? 0 : 1;
    const bRelevant = ["Generic", state.enemy.role, state.enemy.clan, state.enemy.affiliation].includes(b.source) ? 0 : 1;
    return aRelevant - bRelevant || a.name.localeCompare(b.name);
  });
}

function renderTraits() {
  const calc = calculateEnemy(rules, state.enemy);
  const over = state.enemy.traits.length > calc.traitLimit;
  $("#trait-budget").classList.toggle("over", over);
  $("#trait-budget").innerHTML = `<strong>${state.enemy.traits.length} / ${calc.traitLimit}</strong><span>${over ? "Above the official suggested limit" : "Suggested trait slots used"}</span>`;
  const filtered = filteredTraits();
  $("#trait-results").innerHTML = `<div class="result-count">${filtered.length.toLocaleString()} matches · showing ${Math.min(80, filtered.length)}</div>` + filtered.slice(0, 80).map((trait) => {
    const selected = state.enemy.traits.includes(trait.id);
    return `<article class="catalogue-card${selected ? " selected" : ""}"><div><h5>${esc(trait.name)}</h5><div class="meta">${esc(trait.rank)} · ${esc(trait.source)} · ${esc(trait.categories)}</div><p>${esc(trait.description)}</p></div><button data-toggle-trait="${trait.id}">${selected ? "Remove" : "Add"}</button></article>`;
  }).join("");
  renderSelected("#selected-traits", state.enemy.traits, rules.traits, "trait");
}

function filteredJutsu() {
  const search = $("#jutsu-search").value.trim().toLowerCase();
  const rank = $("#jutsu-rank").value;
  const discipline = $("#jutsu-discipline").value;
  return rules.jutsu.filter((jutsu) => {
    const haystack = `${jutsu.name} ${jutsu.description} ${jutsu.keywords} ${jutsu.castingTime}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!rank || jutsu.rank === rank) && (!discipline || jutsu.discipline === discipline);
  });
}

function actionCoverage() {
  const selected = state.enemy.jutsu.map((id) => rules.jutsu.find((jutsu) => jutsu.id === id)).filter(Boolean);
  return {
    action: selected.some((item) => /action/i.test(item.castingTime) && !/bonus|reaction/i.test(item.castingTime)) || state.enemy.weapons.length || state.enemy.customActions.some((item) => item.type === "Action"),
    bonus: selected.some((item) => /bonus action/i.test(item.castingTime)) || state.enemy.customActions.some((item) => item.type === "Bonus Action"),
    reaction: selected.some((item) => /reaction/i.test(item.castingTime)) || state.enemy.customActions.some((item) => item.type === "Reaction"),
  };
}

function renderJutsu() {
  const guidance = calculateGuidelines(rules, state.enemy);
  const coverage = actionCoverage();
  $("#action-coverage").innerHTML = Object.entries(coverage).map(([name, covered]) => `<div><span>${name[0].toUpperCase() + name.slice(1)}</span><b class="${covered ? "good" : "missing"}">${covered ? "Covered" : "Missing"}</b></div>`).join("");
  const filtered = filteredJutsu();
  $("#jutsu-results").innerHTML = `<div class="result-count">${filtered.length.toLocaleString()} matches · showing ${Math.min(80, filtered.length)}</div>` + filtered.slice(0, 80).map((jutsu) => {
    const selected = state.enemy.jutsu.includes(jutsu.id);
    const aboveRank = RANK_ORDER.indexOf(jutsu.rank) > RANK_ORDER.indexOf(guidance.maxJutsuRank);
    return `<article class="catalogue-card${selected ? " selected" : ""}${aboveRank ? " above-guideline" : ""}"><div><h5>${esc(jutsu.name)}${aboveRank ? `<span class="advisory-tag">Above suggested rank</span>` : ""}</h5><div class="meta">${esc(jutsu.rank)} · ${esc(jutsu.discipline)} · ${esc(jutsu.castingTime)} · ${esc(jutsu.cost)}</div><p>${esc(jutsu.description)}</p></div><button data-toggle-jutsu="${jutsu.id}">${selected ? "Remove" : "Add"}</button></article>`;
  }).join("");
  renderSelected("#selected-jutsu", state.enemy.jutsu, rules.jutsu, "jutsu", (item) => `${item.rank} · ${item.castingTime}`);
}

function filteredWeapons() {
  const search = $("#weapon-search").value.trim().toLowerCase();
  const group = $("#weapon-group").value;
  return rules.weapons.filter((weapon) => `${weapon.name} ${weapon.qualities} ${weapon.group}`.toLowerCase().includes(search) && (!group || String(weapon.group).includes(group)));
}

function renderWeapons() {
  const filtered = filteredWeapons();
  $("#weapon-results").innerHTML = `<div class="result-count">${filtered.length.toLocaleString()} matches</div>` + filtered.map((weapon) => {
    const selected = state.enemy.weapons.includes(weapon.id);
    return `<article class="catalogue-card${selected ? " selected" : ""}"><div><h5>${esc(weapon.name)}</h5><div class="meta">${esc(weapon.damage)} ${esc(weapon.damageType)} · ${esc(weapon.range)}</div><p>${esc(weapon.qualities)}</p></div><button data-toggle-weapon="${weapon.id}">${selected ? "Remove" : "Add"}</button></article>`;
  }).join("");
  renderSelected("#selected-weapons", state.enemy.weapons, rules.weapons, "weapon", (item) => `${item.damage} ${item.damageType}`);
}

function renderSelected(selector, ids, catalogue, kind, detail = (item) => `${item.rank || ""} · ${item.source || item.discipline || ""}`) {
  const items = ids.map((id) => catalogue.find((item) => item.id === id)).filter(Boolean);
  $(selector).innerHTML = items.length ? items.map((item) => `<div class="selected-item"><div><strong>${esc(item.name)}</strong><small>${esc(detail(item))}</small></div><button class="remove-button" data-toggle-${kind}="${item.id}" aria-label="Remove ${esc(item.name)}">×</button></div>`).join("") : `<div class="empty-state">Nothing selected yet.</div>`;
}

function renderCustomActions() {
  $("#custom-actions").innerHTML = state.enemy.customActions.length ? state.enemy.customActions.map((action) => `<div class="selected-item"><div><strong>${esc(action.name)}</strong><small>${esc(action.type)} · ${esc(action.detail)}</small></div><button class="remove-button" data-remove-action="${action.id}">×</button></div>`).join("") : "";
}

function statEntries(items, formatter) {
  return items.length ? items.map(formatter).join("") : `<p class="stat-entry">None.</p>`;
}

function renderStatblock() {
  const calc = calculateEnemy(rules, state.enemy);
  const traits = state.enemy.traits.map((id) => rules.traits.find((item) => item.id === id)).filter(Boolean);
  const jutsu = state.enemy.jutsu.map((id) => rules.jutsu.find((item) => item.id === id)).filter(Boolean);
  const weapons = state.enemy.weapons.map((id) => rules.weapons.find((item) => item.id === id)).filter(Boolean);
  const trainedSkills = rules.skills.filter((skill) => state.enemy.skillProficiencies.includes(skill.name) || Number(state.enemy.skillMasteryRanks[skill.name] || 0) > 0).map((skill) => {
    const ability = skill.ability?.slice(0, 3) || "Int";
    const proficiency = state.enemy.skillProficiencies.includes(skill.name) ? calc.proficiency : 0;
    const mastery = Number(state.enemy.skillMasteryRanks[skill.name] || 0) * 2;
    return `${skill.name} ${signed(calc.abilities[ability] + proficiency + mastery)}`;
  });
  const saveText = ABILITIES.map((ability) => `${ability} ${signed(calc.saves[ability])}`).join(", ");
  const defenseLines = [state.enemy.resistances && `<div class="stat-line"><strong>Damage Resistances</strong> ${esc(state.enemy.resistances)}</div>`, state.enemy.immunities && `<div class="stat-line"><strong>Immunities</strong> ${esc(state.enemy.immunities)}</div>`, state.enemy.vulnerabilities && `<div class="stat-line"><strong>Vulnerabilities</strong> ${esc(state.enemy.vulnerabilities)}</div>`].filter(Boolean).join("");
  $("#statblock").innerHTML = `
    <header class="statblock-header"><h3>${esc(state.enemy.name || "Unnamed adversary")}</h3><p>${esc(state.enemy.size)} ${esc(state.enemy.enemyClass)} ${esc(state.enemy.role)}, ${esc(state.enemy.rank)} · Level ${calc.level}</p></header>
    <div class="statblock-body">
      <div class="statblock-core"><div><strong>Armor Class</strong> ${calc.ac}</div><div><strong>Hit Points</strong> ${calc.hp}</div><div><strong>Chakra</strong> ${calc.chakra}</div><div><strong>Speed</strong> ${calc.speed} ft.</div><div><strong>Initiative</strong> ${signed(calc.abilities.Dex + (state.enemy.enemyClass === "Elite" ? 2 : state.enemy.enemyClass === "Solo" ? 4 : state.enemy.enemyClass === "Minion" ? -2 : 0))}</div><div><strong>Proficiency</strong> ${signed(calc.proficiency)}</div><div><strong>Tenacity</strong> ${calc.tenacity}</div><div><strong>Damage / action</strong> ${calc.damagePerAction}</div></div>
      <div class="stat-abilities">${ABILITIES.map((ability) => `<div><strong>${ability.toUpperCase()}</strong><span>${signed(calc.abilities[ability])}</span></div>`).join("")}</div>
      <div class="stat-line"><strong>Saving Throws</strong> ${saveText}</div>
      ${trainedSkills.length ? `<div class="stat-line"><strong>Skills</strong> ${esc(trainedSkills.join(", "))}</div>` : ""}
      ${defenseLines}
      ${state.enemy.damageReduction ? `<div class="stat-line"><strong>Damage Reduction</strong> ${esc(state.enemy.damageReduction)}</div>` : ""}
      ${state.enemy.senses ? `<div class="stat-line"><strong>Senses</strong> ${esc(state.enemy.senses)}</div>` : ""}
      ${state.enemy.languages ? `<div class="stat-line"><strong>Languages</strong> ${esc(state.enemy.languages)}</div>` : ""}
      <div class="stat-line"><strong>Jutsu</strong> Ninjutsu ${signed(calc.saveDcs.Ninjutsu.attack)} / DC ${calc.saveDcs.Ninjutsu.dc}; Genjutsu ${signed(calc.saveDcs.Genjutsu.attack)} / DC ${calc.saveDcs.Genjutsu.dc}; Taijutsu ${signed(calc.saveDcs.Taijutsu.attack)} / DC ${calc.saveDcs.Taijutsu.dc}</div>
      ${state.enemy.concept ? `<div class="statblock-section"><h4>Concept</h4><p class="stat-entry">${esc(state.enemy.concept)}</p></div>` : ""}
      <div class="statblock-section"><h4>Traits</h4>${statEntries(traits, (trait) => `<p class="stat-entry"><strong>${esc(trait.name)}.</strong> ${esc(trait.description)}</p>`)}</div>
      <div class="statblock-section"><h4>Actions</h4>
        ${statEntries(weapons, (weapon) => { const ability = String(weapon.ability || "STR").slice(0, 3).replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase()); const mod = calc.abilities[ability] ?? calc.abilities.Str; return `<p class="stat-entry"><strong>${esc(weapon.name)}.</strong> ${esc(weapon.attackType)}: ${signed(calc.proficiency + mod + Number(calc.rank.toHitBonus || 0))} to hit, range ${esc(weapon.range)}, ${esc(weapon.targets)}. Hit: ${esc(weapon.damage)} ${signed(mod)} ${esc(weapon.damageType)} damage. ${esc(weapon.qualities)}</p>`; })}
        ${state.enemy.customActions.map((action) => `<p class="stat-entry"><strong>${esc(action.name)} (${esc(action.type)}).</strong> ${esc(action.detail)}</p>`).join("")}
      </div>
      <div class="statblock-section"><h4>Jutsu</h4>${statEntries(jutsu, (item) => `<p class="stat-entry"><strong>${esc(item.name)} (${esc(item.rank)}, ${esc(item.castingTime)}).</strong> ${esc(item.cost)}; ${esc(item.range)}; ${esc(item.duration)}. ${esc(item.description)}${item.higherRanks ? ` <em>${esc(item.higherRanks)}</em>` : ""}</p>`)}</div>
      ${Object.values(state.enemy.tactics).some(Boolean) ? `<div class="statblock-section"><h4>Combat plan</h4>${Object.entries(state.enemy.tactics).filter(([, value]) => value).map(([key, value]) => `<p class="stat-entry"><strong>${esc(key[0].toUpperCase() + key.slice(1))}.</strong> ${esc(value)}</p>`).join("")}</div>` : ""}
      ${state.enemy.enemyClass === "Elite" || state.enemy.enemyClass === "Solo" ? `<div class="statblock-section"><h4>Phase transition</h4><p class="stat-entry">At ${Math.floor(calc.hp * .6)} HP, enter phase 2. At ${Math.floor(calc.hp * .3)} HP, enter phase 3. Tenacity pool: ${calc.tenacity}.</p></div>` : ""}
      ${state.enemy.notes ? `<div class="statblock-section"><h4>DM notes</h4><p class="stat-entry">${esc(state.enemy.notes)}</p></div>` : ""}
      <div class="stat-tags"><span>${esc(state.enemy.clan)}</span><span>${esc(state.enemy.affiliation)}</span><span>${esc(state.enemy.classModTier)}</span><span>${calc.attacks} assumed attacks</span></div>
    </div>`;
  const warnings = validateEnemy(rules, state.enemy);
  $("#validation").innerHTML = warnings.length ? warnings.map((warning) => `<div class="warning">${esc(warning)}</div>`).join("") : `<div class="success">The build covers a reliable action, bonus action, reaction, and the suggested trait budget.</div>`;
}

function renderEncounter() {
  $("#party-levels").innerHTML = state.encounter.partyLevels.map((level, index) => `<div class="party-member"><label>Shinobi ${index + 1}<input data-party-index="${index}" type="number" min="1" max="30" value="${esc(level)}"></label><button class="remove-button" data-remove-party="${index}"${state.encounter.partyLevels.length === 1 ? " disabled" : ""}>×</button></div>`).join("");
  $("#encounter-entries").innerHTML = state.encounter.entries.length ? state.encounter.entries.map((entry, index) => `<div class="encounter-entry"><div><strong>${esc(entry.name)}</strong><small>Level ${entry.level} · ${esc(entry.enemyClass)}${entry.classModTier !== "None" ? ` · ${esc(entry.classModTier)}` : ""}</small></div><label>Count<input data-entry-count="${index}" type="number" min="1" max="99" value="${entry.count}"></label><button class="remove-button" data-remove-entry="${index}">×</button></div>`).join("") : `<div class="empty-state">Add the current enemy or one from the roster.</div>`;
  const result = calculateEncounter(rules, state.encounter.partyLevels, state.encounter.entries);
  const metrics = [["Party size", result.partySize], ["PAL", result.pal.toFixed(1)], ["Enemies", result.enemyCount], ["TEL", result.tel.toFixed(1)], ["REL", result.rel.toFixed(1)], ["Difficulty", result.difficulty]];
  $("#encounter-summary").innerHTML = metrics.map(([label, value]) => `<div class="encounter-metric${label === "Difficulty" ? " difficulty" : ""}"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("");
  $("#roster").innerHTML = state.roster.length ? state.roster.map((enemy) => `<article class="roster-card"><h5>${esc(enemy.name)}</h5><p>Level ${enemy.level} · ${esc(enemy.enemyClass)} · ${esc(enemy.role)}</p><div class="roster-actions"><button class="button ghost small" data-load-roster="${enemy.id}">Load</button><button class="button ghost small" data-add-roster="${enemy.id}">Add to encounter</button><button class="button danger small" data-delete-roster="${enemy.id}">Delete</button></div></article>`).join("") : `<div class="empty-state">No saved adversaries yet.</div>`;
}

function addEnemyToEncounter(enemy) {
  const existing = state.encounter.entries.find((entry) => entry.enemyId === enemy.id);
  if (existing) existing.count += 1;
  else state.encounter.entries.push({ enemyId: enemy.id, name: enemy.name, level: Number(enemy.level), enemyClass: enemy.enemyClass, classModTier: enemy.classModTier || "None", count: 1 });
  persist("Encounter updated");
  renderEncounter();
}

function showNotice(message) {
  $("#notice").textContent = message;
  $("#notice").classList.remove("hidden");
  setTimeout(() => $("#notice").classList.add("hidden"), 3500);
}

function bindEvents() {
  $("#step-nav").addEventListener("click", (event) => { const button = event.target.closest("[data-step]"); if (button) setStep(button.dataset.step); });
  document.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (field) {
      state.enemy[field] = numberFields.has(field) ? Number(event.target.value) : event.target.value;
      persist(); renderSummary(); renderCore(); renderAbilities(); renderGuide(); renderStatblock();
      if (["level", "enemyClass", "rank", "role"].includes(field)) { renderTraits(); renderJutsu(); renderWeapons(); }
      return;
    }
    const tactic = event.target.dataset.tactic;
    if (tactic) { state.enemy.tactics[tactic] = event.target.value; persist(); renderGuide(); renderStatblock(); return; }
    if (event.target.matches("#trait-search, #trait-rank, #trait-category")) renderTraits();
    if (event.target.matches("#jutsu-search, #jutsu-rank, #jutsu-discipline")) renderJutsu();
    if (event.target.matches("#weapon-search, #weapon-group")) renderWeapons();
    if (event.target.matches("#skill-search")) renderAbilities();
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.arraySlot !== undefined) {
      const index = Number(event.target.dataset.arraySlot); const wanted = event.target.value; const other = state.enemy.abilityOrder.indexOf(wanted); const current = state.enemy.abilityOrder[index];
      state.enemy.abilityOrder[index] = wanted; if (other >= 0 && other !== index) state.enemy.abilityOrder[other] = current; commit("Ability array updated"); return;
    }
    if (event.target.dataset.adjust) { state.enemy.abilityAdjustments[event.target.dataset.adjust] = Number(event.target.value); commit("Ability adjustment saved"); return; }
    if (event.target.dataset.saveProf) { const ability = event.target.dataset.saveProf; state.enemy.saveProficiencies = event.target.checked ? [...new Set([...state.enemy.saveProficiencies, ability])] : state.enemy.saveProficiencies.filter((item) => item !== ability); commit(); return; }
    if (event.target.dataset.skillProf) { const skill = event.target.dataset.skillProf; toggleArray(state.enemy.skillProficiencies, skill, event.target.checked); if (!event.target.checked) { delete state.enemy.skillMasteryRanks[skill]; state.enemy.skillMasteries = state.enemy.skillMasteries.filter((item) => item !== skill); } commit(); return; }
    if (event.target.dataset.skillMastery) { const skill = event.target.dataset.skillMastery; const rank = Number(event.target.value); if (rank > 0) { state.enemy.skillMasteryRanks[skill] = rank; if (!state.enemy.skillProficiencies.includes(skill)) state.enemy.skillProficiencies.push(skill); if (!state.enemy.skillMasteries.includes(skill)) state.enemy.skillMasteries.push(skill); } else { delete state.enemy.skillMasteryRanks[skill]; state.enemy.skillMasteries = state.enemy.skillMasteries.filter((item) => item !== skill); } commit(); return; }
    if (event.target.dataset.partyIndex !== undefined) { state.encounter.partyLevels[Number(event.target.dataset.partyIndex)] = Number(event.target.value); persist(); renderEncounter(); }
    if (event.target.dataset.entryCount !== undefined) { state.encounter.entries[Number(event.target.dataset.entryCount)].count = Number(event.target.value); persist(); renderEncounter(); }
  });
  document.addEventListener("click", (event) => {
    for (const kind of ["trait", "jutsu", "weapon"]) {
      const key = `toggle${kind[0].toUpperCase()}${kind.slice(1)}`;
      if (event.target.dataset[key]) { const property = { trait: "traits", jutsu: "jutsu", weapon: "weapons" }[kind]; const list = state.enemy[property]; toggleArray(list, event.target.dataset[key], !list.includes(event.target.dataset[key])); commit(`${kind} selection updated`); return; }
    }
    if (event.target.dataset.removeAction) { state.enemy.customActions = state.enemy.customActions.filter((action) => action.id !== event.target.dataset.removeAction); commit(); return; }
    if (event.target.dataset.removeParty !== undefined) { state.encounter.partyLevels.splice(Number(event.target.dataset.removeParty), 1); persist(); renderEncounter(); return; }
    if (event.target.dataset.removeEntry !== undefined) { state.encounter.entries.splice(Number(event.target.dataset.removeEntry), 1); persist(); renderEncounter(); return; }
    if (event.target.dataset.loadRoster) { const enemy = state.roster.find((item) => item.id === event.target.dataset.loadRoster); if (enemy) { state.enemy = hydrateEnemy(JSON.parse(JSON.stringify(enemy))); syncForm(); commit("Roster adversary loaded"); setStep("forge"); } return; }
    if (event.target.dataset.addRoster) { const enemy = state.roster.find((item) => item.id === event.target.dataset.addRoster); if (enemy) addEnemyToEncounter(enemy); return; }
    if (event.target.dataset.deleteRoster) { state.roster = state.roster.filter((item) => item.id !== event.target.dataset.deleteRoster); state.encounter.entries = state.encounter.entries.filter((entry) => entry.enemyId !== event.target.dataset.deleteRoster); persist("Roster entry deleted"); renderEncounter(); }
  });
  $("#new-enemy").addEventListener("click", () => { state.enemy = defaultEnemy(rules); syncForm(); commit("New adversary started"); setStep("forge"); });
  $("#save-roster").addEventListener("click", () => { const index = state.roster.findIndex((enemy) => enemy.id === state.enemy.id); const snapshot = hydrateEnemy(JSON.parse(JSON.stringify(state.enemy))); if (index >= 0) state.roster[index] = snapshot; else state.roster.push(snapshot); persist("Saved to adversary roster"); renderEncounter(); showNotice(`${state.enemy.name} saved to the roster.`); });
  $("#export-json").addEventListener("click", () => { const blob = new Blob([JSON.stringify({ format: "threat-forge", version: 1, enemy: state.enemy }, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${(state.enemy.name || "adversary").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.json`; link.click(); URL.revokeObjectURL(link.href); });
  $("#import-json").addEventListener("change", async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const parsed = JSON.parse(await file.text()); state.enemy = hydrateEnemy(parsed.enemy || parsed); syncForm(); commit("Imported adversary JSON"); showNotice("Adversary imported successfully."); } catch { showNotice("That file is not valid Threat Forge JSON."); } event.target.value = ""; });
  $("#add-custom-action").addEventListener("click", () => { const name = $("#custom-action-name").value.trim(); if (!name) return showNotice("Give the custom action a name first."); state.enemy.customActions.push({ id: crypto.randomUUID(), name, type: $("#custom-action-type").value, detail: $("#custom-action-detail").value.trim() }); $("#custom-action-name").value = ""; $("#custom-action-detail").value = ""; commit("Custom action added"); });
  $("#print-statblock").addEventListener("click", () => window.print());
  $("#add-party-member").addEventListener("click", () => { state.encounter.partyLevels.push(state.encounter.partyLevels.at(-1) || 1); persist(); renderEncounter(); });
  $("#add-current-encounter").addEventListener("click", () => addEnemyToEncounter(state.enemy));
  $("#previous-step").addEventListener("click", () => { const index = stepOrder.indexOf(state.step); if (index > 0) setStep(stepOrder[index - 1]); });
  $("#next-step").addEventListener("click", () => { const index = stepOrder.indexOf(state.step); if (index < stepOrder.length - 1) setStep(stepOrder[index + 1]); });
}

function toggleArray(array, value, enabled) {
  const index = array.indexOf(value);
  if (enabled && index < 0) array.push(value);
  if (!enabled && index >= 0) array.splice(index, 1);
}

async function init() {
  try {
    rules = await fetch("data/rules.json").then((response) => { if (!response.ok) throw new Error("Rules file unavailable"); return response.json(); });
    state = loadState();
    populateStaticOptions();
    syncForm();
    bindEvents();
    $("#source-version").textContent = `Sheet ${rules.source.version} · ${rules.traits.length.toLocaleString()} traits · ${rules.jutsu.length.toLocaleString()} jutsu`;
    commit("Ready · changes autosave locally");
    setStep(state.step);
  } catch (error) {
    $("#notice").classList.remove("hidden");
    $("#notice").textContent = `Could not load the adversary catalogue: ${error.message}`;
    $("#save-status").textContent = "Rules unavailable";
  }
}

init();

<!-- Generated from packages/games/rebellion/knowledge — do not edit; UPDATE_KB_DOCS=1 -->

# Star Wars: Rebellion — rules knowledge base (index)

## Sources

| Tag | Title | Kind | Version | Date | Pages | Excluded pages | Status |
|---|---|---|---|---|---|---|---|
| `RR` | [Star Wars: Rebellion — Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/d9/76/d97645d4-3973-41b6-ad78-6c9b927d3bc1/sw03_rules_reference_web.pdf) | rules | web edition (HTTP Last-Modified 2016-03-22) | 2016-03-22 | 16 |  | current |
| `LTP` | [Star Wars: Rebellion — Learn to Play](https://images-cdn.fantasyflightgames.com/filer_public/0b/07/0b07601a-6ac3-4333-ac41-b6d1b9a979da/sw03_learn_to_play_web.pdf) | tutorial | web edition (HTTP Last-Modified 2016-03-22) | 2016-03-22 | 20 |  | current |
| `FAQ` | [Star Wars: Rebellion — FAQ and Errata](https://images-cdn.fantasyflightgames.com/filer_public/53/ac/53ac8f34-2d3b-4ec1-bfe8-816811756692/sw03_faq_v2_1.pdf) | faq | 2.1 (May 2019) | 2019-05-09 | 8 | 6, 7, 8 | current |

## Entries by kind

| Kind | Entries |
|---|---|
| rule | 126 |
| clarification | 30 |
| interpretation | 11 |
| implementation-note | 14 |
| **total** | 181 |

## General rules and components (`general`)

- `rebellion:general.cheating` Bluffing is allowed, cheating loses — rule, verified (RR p.4)
- `rebellion:general.component-limits` Component limitations — rule, verified (RR p.6)
- `rebellion:general.component-limits.destroy-own` When a player may destroy his own units — clarification, verified (FAQ p.5)
- `rebellion:general.current-player` Current player — rule, verified (RR p.6; RR p.2)
- `rebellion:general.dice` Dice results — rule, verified (RR p.7)
- `rebellion:general.discarding` Discard piles — rule, verified (RR p.7)
- `rebellion:general.faq-errata` FAQ errata officially change rule and card text — clarification, verified (FAQ p.1)
- `rebellion:general.golden-rules.cannot` "Cannot" is absolute — rule, verified (RR p.2)
- `rebellion:general.golden-rules.precedence` Precedence of sources — rule, verified (RR p.2)
- `rebellion:general.notes-allowed` Taking notes is allowed — clarification, verified (FAQ p.5)
- `rebellion:general.simultaneous-timing` Abilities with the same timing — clarification, verified (FAQ p.4)
- `rebellion:impl.component-limits` core-v1 does not enforce component limits — implementation-note, verified (RR p.6)

## Game round (`round`)

- `rebellion:round.rr-activation-phase-typo` "Activation Phase" in the Rounds entry means the Assignment Phase — interpretation, verified (RR p.13; RR p.3; LTP p.6)
- `rebellion:round.structure` Game round: Assignment, Command, Refresh — rule, verified (LTP p.6; RR p.13; LTP p.20)

## Assignment Phase (`assignment`)

- `rebellion:assignment.extra-leader-by-ability` Adding a second leader when an ability assigns one — clarification, verified (FAQ p.4)
- `rebellion:assignment.order` Assigning leaders to missions — rule, verified (RR p.3; LTP p.6)

## Command Phase (`command`)

- `rebellion:command.leader-anywhere-in-system` A leader in a system takes part in everything there — rule, verified (RR p.6)
- `rebellion:command.pass` Passing — rule, verified (RR p.6; LTP p.7)
- `rebellion:command.pass-is-not-action` Passing replaces a turn — clarification, verified (FAQ p.5)
- `rebellion:command.pass-not-mid-activation` No passing in the middle of an activation — interpretation, **needs-review** (RR p.6; FAQ p.5)
- `rebellion:command.passed-player-still-reacts` A passed player can still oppose and defend — rule, verified (RR p.6)
- `rebellion:command.turn-order` Command Phase turn order — rule, verified (RR p.6; LTP p.7)
- `rebellion:command.unrevealed-missions-return` Unrevealed missions return at the end of the phase — rule, verified (RR p.6)
- `rebellion:impl.pass-during-activation` core-v1 rejects PASS during an own activation — implementation-note, verified (RR p.6)

### Activating systems (`activation`)

- `rebellion:command.activate.overflow` Not enough room in a system — rule, verified (RR p.2)
- `rebellion:command.activate.own-leader-system` Activating a system that holds one's own leader — interpretation, **needs-review** (RR p.2)
- `rebellion:command.activate.place-leader` Activate a system by placing a leader — rule, verified (RR p.2; LTP p.7)
- `rebellion:command.activate.steps` Steps of an activation — rule, verified (RR p.2)
- `rebellion:command.activate.system-with-leader` A system that already holds a leader can be activated — rule, verified (RR p.2)
- `rebellion:command.activate.tactic-values-required` Only leaders with tactic values can activate — rule, verified (RR p.2; RR p.9; LTP p.7)
- `rebellion:command.activate.zero-units` An activation may move no units — clarification, verified (FAQ p.1)

### Moving units (`movement`)

- `rebellion:command.move.abilities-follow-rules` Abilities that move units follow the movement rules — rule, verified (RR p.9)
- `rebellion:command.move.adjacency` Adjacency and impassable areas — rule, verified (RR p.9; RR p.12; LTP p.7)
- `rebellion:command.move.base-space-leader-missions` A leader on the Rebel Base space blocks mission movement from it — clarification, verified (FAQ p.1)
- `rebellion:command.move.combat-trigger` Moving into enemy units causes combat — rule, verified (RR p.9; RR p.4)
- `rebellion:command.move.immobile` Immobile units never move — rule, verified (RR p.9; RR p.13; RR p.6)
- `rebellion:command.move.into-activated-from-adjacent` Units move only into the activated system, from adjacent systems — rule, verified (RR p.9; RR p.2; LTP p.7)
- `rebellion:command.move.no-enemy-pinning` Enemy units or leaders do not pin units — interpretation, **needs-review** (RR p.9)
- `rebellion:command.move.own-leader-locks` Units cannot leave a system that contains their own leader — rule, verified (RR p.9; RR p.2; RR p.8; LTP p.7)
- `rebellion:command.move.rapid-mobilization-locked` Mission movement is also blocked by own leaders — clarification, verified (FAQ p.4)

#### Transport capacity (`transport`)

- `rebellion:command.transport.capacity` Transport capacity — rule, verified (RR p.9; RR p.14; LTP p.7)
- `rebellion:command.transport.restriction-icon` Transport restriction icon — rule, verified (RR p.9; LTP p.7)
- `rebellion:impl.transport-one-source-per-command` core-v1 checks transport per MOVE_PIECES command — implementation-note, verified (RR p.9)
- `rebellion:units.faction-sheet-values` Transport capacities used by the engine — interpretation, **needs-review** (RR p.14; LTP p.4)

## Missions (`missions`)

- `rebellion:impl.no-missions` core-v1 has no missions and an empty Assignment Phase — implementation-note, verified (RR p.3; RR p.8)
- `rebellion:missions.against-leader` Missions attempted against a leader — rule, verified (RR p.9; LTP p.8)
- `rebellion:missions.card-errata` Errata to three base game cards — clarification, verified (FAQ p.1)
- `rebellion:missions.leader-removed` Leader removed from a mission card — rule, verified (RR p.9)
- `rebellion:missions.no-benefit` Missions without benefit; attempt versus resolve — clarification, verified (FAQ p.4)
- `rebellion:missions.opposition-dice` Opposed missions — rule, verified (RR p.9; LTP p.8)
- `rebellion:missions.projects` Project cards — rule, verified (RR p.10)
- `rebellion:missions.rebel-base-space` Missions on the Rebel Base space — rule, verified (LTP p.8)
- `rebellion:missions.reveal-requirement` Skill requirement to reveal a mission — rule, verified (RR p.8; LTP p.8)
- `rebellion:missions.reveal-steps` Revealing a mission — rule, verified (RR p.8; RR p.9; LTP p.8)
- `rebellion:missions.starting` Starting missions — rule, verified (RR p.13; LTP p.8)
- `rebellion:missions.unopposed` Unopposed missions succeed — rule, verified (RR p.9; LTP p.8)

## Combat (`combat`)

- `rebellion:combat.attack` Resolving an attack — rule, verified (RR p.4; RR p.5; LTP p.14)
- `rebellion:combat.damage` Damage and damage markers — rule, verified (RR p.6; RR p.5)
- `rebellion:combat.end` End of combat — rule, verified (RR p.4)
- `rebellion:combat.retreat` Retreating — rule, verified (RR p.5; LTP p.15)
- `rebellion:combat.retreat-faq` Retreat rulings — clarification, verified (FAQ p.2)
- `rebellion:combat.retreat-limits` Retreat restrictions — rule, verified (RR p.5)
- `rebellion:combat.round` Combat round — rule, verified (RR p.4; RR p.13; LTP p.14)
- `rebellion:combat.steps` Combat steps — rule, verified (RR p.4; LTP p.14; LTP p.20)
- `rebellion:combat.theater` Theaters — rule, verified (RR p.14)
- `rebellion:combat.trigger` When combat happens — rule, verified (RR p.4; LTP p.14; RR p.2)
- `rebellion:combat.winning-battle` Winning a battle — rule, verified (RR p.5)
- `rebellion:impl.no-combat` core-v1 has no combat — implementation-note, verified (RR p.4; RR p.2)

## Refresh Phase (`refresh`)

- `rebellion:impl.refresh-partial` core-v1 Refresh: only retrieve leaders and advance time — implementation-note, verified (RR p.12)
- `rebellion:refresh.advance-time` Step 5: advance the time marker, recruit and build — rule, verified (RR p.12; LTP p.10)
- `rebellion:refresh.deploy-step` Step 6: slide the build queue and deploy — rule, verified (RR p.12; LTP p.10)
- `rebellion:refresh.draw-missions` Step 2: draw missions, hand limit 10 — rule, verified (RR p.12; LTP p.10)
- `rebellion:refresh.draw-objective` Step 4: draw an objective — rule, verified (RR p.12; LTP p.10)
- `rebellion:refresh.probe-droids` Step 3: launch probe droids — rule, verified (RR p.12; RR p.10; LTP p.10)
- `rebellion:refresh.retrieve-leaders` Step 1: retrieve leaders — rule, verified (RR p.12; LTP p.10)
- `rebellion:refresh.steps` Refresh Phase steps — rule, verified (RR p.12; LTP p.10; LTP p.20)
- `rebellion:refresh.time-track-icons` Which time track spaces show recruit and build icons — interpretation, **needs-review** (RR p.12; LTP p.10)

### Building and deploying units (`build-deploy`)

- `rebellion:build.blocked-by-enemy` Enemy units and sabotage block building — rule, verified (RR p.3; LTP p.10)
- `rebellion:build.build-units` Building units — rule, verified (RR p.3; RR p.12; LTP p.10)
- `rebellion:build.fewer-units` Building fewer units is allowed — clarification, verified (FAQ p.5)
- `rebellion:build.rebel-base-icons` Building from the Rebel Base space — rule, verified (RR p.3; LTP p.10)
- `rebellion:build.rebel-choices` Rebel unit choices — rule, verified (RR p.3)
- `rebellion:build.sabotage` Sabotage markers — rule, verified (RR p.13; LTP p.12)
- `rebellion:build.sabotage-wording` Sabotage only affects "build" and "deploy" abilities — clarification, verified (FAQ p.5)
- `rebellion:deploy.deploy-units` Deploying units — rule, verified (RR p.7; LTP p.10)
- `rebellion:deploy.gain-units` Gaining units — rule, verified (RR p.7)
- `rebellion:deploy.rebel-base-space` Deploying to the Rebel Base space — rule, verified (RR p.7; LTP p.12)
- `rebellion:deploy.restrictions` Where units cannot be deployed — rule, verified (RR p.7; RR p.12)
- `rebellion:deploy.subjugated-not-for-rebels` Rebels cannot use subjugated systems — rule, verified (LTP p.13)

### Recruiting leaders (`recruit`)

- `rebellion:recruit.card-choice` Choosing an action card that recruits nobody — clarification, verified (FAQ p.5)
- `rebellion:recruit.first-game` First game: action card abilities are ignored — rule, verified (LTP p.10)
- `rebellion:recruit.procedure` Recruiting leaders — rule, verified (RR p.11; RR p.12; LTP p.10)
- `rebellion:recruit.restrictions` Who can be recruited — rule, verified (RR p.11)

## Rebel base (`rebel-base`)

- `rebellion:base.activate-space` Activating the Rebel Base space — rule, verified (RR p.10)
- `rebellion:base.after-reveal` While the base is revealed — rule, verified (RR p.11; LTP p.12)
- `rebellion:base.death-star-does-not-reveal` The Death Star does not reveal the base — clarification, verified (FAQ p.1; RR p.11)
- `rebellion:base.deploy-when-revealed` Deploying to a revealed base system — clarification, verified (FAQ p.5)
- `rebellion:base.leader-in-space-locks` A leader on the Rebel Base space locks only that space — rule, verified (RR p.9; RR p.10)
- `rebellion:base.move-from-space` Moving to and from the Rebel Base space — rule, verified (RR p.10; LTP p.12)
- `rebellion:base.new-base` Establishing a new base — rule, verified (RR p.11; LTP p.12)
- `rebellion:base.reveal-condition` When the Rebel base must be revealed — rule, verified (RR p.11; LTP p.12)
- `rebellion:base.reveal-procedure` How the base is revealed — rule, verified (RR p.11; LTP p.12)
- `rebellion:base.reveal-timing` Revealing the base after Imperial ground units move in — rule, verified (RR p.2; RR p.11; LTP p.7)
- `rebellion:base.secret-location` The Rebel base is chosen secretly — rule, verified (RR p.10; LTP p.12)
- `rebellion:base.ships-do-not-reveal` Imperial ships alone do not reveal the base — rule, verified (RR p.11)
- `rebellion:base.space-not-system` The "Rebel Base" space is not a system — rule, verified (RR p.10; RR p.8; LTP p.12)
- `rebellion:base.units-on-space` Units on the Rebel Base space are outside every system — interpretation, **needs-review** (RR p.10; RR p.11)
- `rebellion:base.voluntary-reveal` Voluntary reveal — rule, verified (RR p.11)
- `rebellion:base.voluntary-reveal-after-pass` No voluntary reveal after passing — clarification, verified (FAQ p.5)
- `rebellion:base.voluntary-reveal-combat` Revealing the base next to Imperial units starts combat — clarification, verified (FAQ p.5)
- `rebellion:base.voluntary-reveal-timing` Voluntary reveal only at the start of a Rebel turn (errata) — clarification, verified (FAQ p.1)
- `rebellion:impl.base-space-merged` core-v1 merges the Rebel Base space with the base system — implementation-note, verified (RR p.10; RR p.9)
- `rebellion:impl.no-voluntary-reveal` core-v1 has no voluntary base reveal — implementation-note, verified (RR p.11; FAQ p.1)
- `rebellion:impl.reveal-only-at-finish` core-v1 checks the reveal only at the end of an Imperial activation — implementation-note, verified (RR p.11)

## Winning the game, time and reputation (`victory`)

- `rebellion:impl.no-objectives` core-v1 has no objectives: reputation never moves — implementation-note, verified (RR p.10; RR p.12)
- `rebellion:victory.empire` Imperial victory: conquer the revealed base — rule, verified (RR p.14; LTP p.11)
- `rebellion:victory.empire-first-in-same-step` Imperial victory precedes an objective fulfilled in the same step — clarification, verified (FAQ p.4)
- `rebellion:victory.rebels` Rebel victory: reputation meets time — rule, verified (RR p.14; RR p.12; LTP p.11)
- `rebellion:victory.reputation` Reputation marker — rule, verified (RR p.12)
- `rebellion:victory.superlaser-hidden-base` Destroying the hidden base's system wins for the Empire — clarification, verified (FAQ p.2; LTP p.11)
- `rebellion:victory.time-track` Time marker — rule, verified (RR p.14; RR p.12)

## Leaders (`leaders`)

- `rebellion:impl.starting-leaders-only` core-v1 has only the starting leaders — implementation-note, verified (RR p.8; RR p.11)
- `rebellion:leaders.attachment-rings` Attachment rings — rule, verified (RR p.3; LTP p.13)
- `rebellion:leaders.captured` Captured leaders — rule, verified (RR p.3; LTP p.13)
- `rebellion:leaders.captured-faq` Captured leaders: tactic values and two rings — clarification, verified (FAQ p.3)
- `rebellion:leaders.carbonite` Carbonite ring — rule, verified (RR p.3)
- `rebellion:leaders.eliminated` Eliminated leaders — rule, verified (RR p.7)
- `rebellion:leaders.luke-jedi` Luke Skywalker (Jedi) — rule, verified (RR p.8)
- `rebellion:leaders.lured-not-captured` A lured leader is not a captured leader — clarification, verified (FAQ p.3)
- `rebellion:leaders.mon-mothma-no-tactics` Mon Mothma cannot activate systems — interpretation, **needs-review** (RR p.2)
- `rebellion:leaders.overview` What leaders do — rule, verified (RR p.8; LTP p.6)
- `rebellion:leaders.rescue` Rescuing captured leaders — rule, verified (RR p.12; LTP p.13)
- `rebellion:leaders.skills` Skills — rule, verified (RR p.13; RR p.7; RR p.8; LTP p.8)
- `rebellion:leaders.starting` Starting leaders — rule, verified (RR p.8; RR p.15; LTP p.4)

## Units (`units`)

- `rebellion:units.attack-health` Attack and health values — rule, verified (RR p.3; RR p.8)
- `rebellion:units.destroyed` Destroyed units — rule, verified (RR p.7)
- `rebellion:units.ground` Ground units — rule, verified (RR p.7; LTP p.7)
- `rebellion:units.roster` Units in the box — rule, verified (RR p.14; LTP p.3)
- `rebellion:units.ships` Ships, capital ships and fighters — rule, verified (RR p.13; RR p.3; RR p.7)
- `rebellion:units.structures` Structures — rule, verified (RR p.13; LTP p.13)

## Systems and regions (`map`)

- `rebellion:map.destroyed-systems` Destroyed systems — rule, verified (RR p.7)
- `rebellion:map.destroyed-systems-faq` Destroyed systems: missions, icons, sabotage — clarification, verified (FAQ p.2)
- `rebellion:map.mustafar-utapau` Mustafar and Utapau are treated as not adjacent — interpretation, **needs-review** (RR p.9)
- `rebellion:map.populous-remote` Populous and remote systems — rule, verified (RR p.10; RR p.12; LTP p.7)
- `rebellion:map.region-names` Regions have no official names — interpretation, **needs-review** (RR p.12)
- `rebellion:map.regions` Regions — rule, verified (RR p.12; LTP p.7)
- `rebellion:map.resource-icons` Resource icons — rule, verified (RR p.12)
- `rebellion:map.resource-icons-on-queue` Placing units on the queue ignores loyalty — clarification, verified (FAQ p.4)
- `rebellion:map.systems` Systems — rule, verified (RR p.14; LTP p.7)

### Loyalty and subjugation (`loyalty`)

- `rebellion:impl.no-loyalty` core-v1 does not model loyalty or subjugation — implementation-note, verified (RR p.8; RR p.13; RR p.2)
- `rebellion:loyalty.basics` Loyalty — rule, verified (RR p.8; LTP p.13)
- `rebellion:loyalty.neutral-errata` A subjugated system can be neutral (errata) — clarification, verified (FAQ p.1)
- `rebellion:loyalty.subjugation` Subjugation — rule, verified (RR p.13; RR p.2; LTP p.13)
- `rebellion:loyalty.system-types` Imperial, Rebel and neutral systems — rule, verified (RR p.8; RR p.11; RR p.10)

## Action, objective, probe and tactic cards (`cards`)

- `rebellion:cards.action` Action cards — rule, verified (RR p.2; LTP p.18)
- `rebellion:cards.objectives` Objective cards — rule, verified (RR p.10; LTP p.11)
- `rebellion:cards.objectives-timing` Objective timing and open card backs — clarification, verified (FAQ p.2)
- `rebellion:cards.probe` Probe cards — rule, verified (RR p.10)
- `rebellion:cards.tactic` Tactic cards — rule, verified (RR p.14)

## Death Star (`death-star`)

- `rebellion:deathstar.build` Building a second Death Star — rule, verified (RR p.6)
- `rebellion:deathstar.destroy` Destroying a Death Star — rule, verified (RR p.6)
- `rebellion:deathstar.faq` Death Star Under Construction rulings — clarification, verified (FAQ p.1)
- `rebellion:deathstar.rules` The Death Star — rule, verified (RR p.6)
- `rebellion:deathstar.superlaser` Destroying systems with the Death Star — rule, verified (LTP p.11)

## Setup (`setup`)

- `rebellion:impl.engine-chooses-base` core-v1 chooses the base system itself — implementation-note, verified (RR p.15; LTP p.5)
- `rebellion:impl.fixed-first-game-setup` core-v1 always uses the first game setup — implementation-note, verified (LTP p.16; RR p.15)
- `rebellion:setup.base-choice` Setup 9: choose the base location — rule, verified (RR p.15; LTP p.5)
- `rebellion:setup.base-choice-restrictions` Base choice: no system with Imperial units — rule, verified (LTP p.5)
- `rebellion:setup.coruscant-placement` Imperial starting units may be placed on Coruscant — interpretation, **needs-review** (RR p.15; RR p.8; LTP p.16)
- `rebellion:setup.decks` Setup 4-7: decks — rule, verified (RR p.15; LTP p.4; LTP p.5)
- `rebellion:setup.factions` Setup 1: choose factions — rule, verified (RR p.15; LTP p.4)
- `rebellion:setup.first-game-empire` First game setup: Empire — rule, verified (LTP p.16)
- `rebellion:setup.first-game-or-standard` First game setup versus standard setup — rule, verified (LTP p.5; LTP p.18; RR p.15)
- `rebellion:setup.first-game-rebels` First game setup: Rebels and probe deck — rule, verified (LTP p.16)
- `rebellion:setup.rebel-units-errata` Rebel starting units: any one system without Imperial units (errata) — clarification, verified (FAQ p.1)
- `rebellion:setup.standard-imperial-units` Standard setup 8.II: Imperial starting units — rule, verified (RR p.15; LTP p.18)
- `rebellion:setup.standard-loyalty` Standard setup 8.I: starting loyalty — rule, verified (RR p.15; LTP p.18)
- `rebellion:setup.standard-rebel-units` Standard setup 8.III: Rebel starting units — rule, verified (RR p.15; LTP p.18)
- `rebellion:setup.starting-action-cards` Standard setup 8.IV: starting action cards — rule, verified (RR p.15; RR p.2; LTP p.4)
- `rebellion:setup.starting-hand` Setup 10: starting hand — rule, verified (RR p.15; LTP p.5)
- `rebellion:setup.time-track` Setup 3: board and time track — rule, verified (RR p.15; LTP p.4)

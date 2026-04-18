# Blue-turtle-defense
Tower defense browser game 

General Description

This project is a statically hosted real-time strategy survival game inspired by the control style and presentation of classic RTS titles such as Age of Empires. The game uses a similar top-down or isometric point of view and familiar RTS interactions, including unit selection, resource management, building placement, and defensive planning. However, instead of focusing on player-versus-player competition, the game is designed around a player-versus-environment survival experience.

The main objective of the game is to defend a central structure, location, or mission-critical objective against repeated enemy invasions. Players must gather resources, expand and organize their base, train units, and construct defenses in order to survive increasingly difficult attacks. Success depends on balancing economic growth, military readiness, and defensive positioning over time.

Because the game is intended to be statically hosted, the project is designed with deployment simplicity in mind. The game should run entirely on the client side, without requiring a dedicated game server for standard gameplay. This makes it easier to deploy, share, and maintain through static hosting platforms while also keeping the project lightweight and accessible.

At a high level, the game aims to combine the satisfaction of classic RTS base-building with the tension of wave defense and survival gameplay. The intended player experience is one of constant preparation, strategic adaptation, and defensive problem-solving, where each invasion tests how well the player has built and protected their stronghold.

Basic Game Layout
1. Core Game Structure

The game is a statically hosted PvE real-time strategy defense game. The player gathers resources, places buildings, unlocks technologies, trains units, and defends a central objective against enemy invasions.

The overall structure is built around three major systems:

base building
unit production and customization
shared technology progression

The design should support easy content expansion, so the project will use a factory + decoder style architecture for game data. This allows units, buildings, equipment, and upgrades to be defined through data and loaded into the game with minimal hardcoded logic. In practice, this means most game objects can be changed, expanded, or rebalanced without rewriting the core game systems.

2. Architectural Direction
2.1 Factory + Decoder Architecture

The game should be structured so that important content is defined through data objects rather than directly embedded in gameplay logic.

Purpose
make units, items, and buildings easy to modify
support future expansion without rewriting systems
separate game content from game logic
allow balancing through data changes
Example usage

A decoder reads structured data for:

soldier equipment
building definitions
tower upgrades
tech tree nodes
production costs
production times

A factory then creates the actual in-game object from that data.

This means:

a new weapon can be added by creating a new equipment definition
a new tower upgrade can be added by extending tower upgrade data
a new building branch can be added with minimal change to the building production logic
3. Main Gameplay Systems
3.1 Buildings

Players can place buildings on the map to expand their economy and military options.

Initial building types

For the first version, the most important building category is military production buildings.

Barracks

The Barracks is the base military production structure.

Its role is:

produce basic infantry units
act as the starting point for military branching

The Barracks can be upgraded into one of two specialized forms:

Range → unlocks ranged unit production
Stable → unlocks cavalry unit production
Shared upgrade status

A key rule is that all Barracks-type buildings share the same upgrade status globally.

This means:

if the player upgrades Barracks into Range technology, all relevant Barracks in the game reflect that unlock state
the upgrade is treated as a player-wide progression state, not an individual building state
this prevents the player from having to manage each building separately for branch unlocks

This shared system should apply to the unlock layer, while individual buildings may still keep their own local production queues or hit points.

3.2 Unit System

The soldier system is based on a single base soldier template that can be modified through equipment.

Base soldier concept

Instead of creating every soldier as a completely separate class, the game starts with a base soldier profile. That base soldier can then be equipped with unlocked items.

This creates flexible unit generation while keeping the unit structure simple.

Equipment-based soldier creation

The player unlocks equipment through progression. Equipment can then be used to define what kind of soldier is produced.

Equipment may affect:

attack
defense
range
movement
special behavior
production cost
production time

The final soldier result is calculated from:

base soldier stats
equipped items
unit branch modifiers
unlocked upgrades
Cost and production calculation

The game should use a sum-based calculation model.

For each produced unit:

Final Unit Stats
= Base Soldier Stats

Equipment Stat Bonuses
Tech Bonuses

Final Production Cost
= Base Soldier Cost

Equipment Cost Additions
Branch/Upgrade Adjustments

Final Production Time
= Base Soldier Time

Equipment Time Additions
Branch/Upgrade Adjustments

This structure makes balancing easier and supports future content scaling.

4. Military Tech Tree Layout

The game includes four main military-related progression branches:

Tower Tech Tree
Infantry Tech Tree
Range Tech Tree
Cavalry Tech Tree

These represent player-wide progression systems.

4.1 Infantry Tech Tree

The Infantry Tech Tree improves the player’s melee ground units.

Possible functions:

unlock new infantry equipment
improve infantry health, damage, armor, or speed
reduce infantry training cost or production time
unlock stronger infantry variants later

This is the default and earliest available troop branch.

4.2 Range Tech Tree

The Range Tech Tree unlocks and improves ranged soldiers.

Requirements:

Range branch must be unlocked from Barracks progression

Possible functions:

unlock bows, crossbows, or other ranged weapons
improve attack range or attack speed
reduce ranged production time
improve projectile-related stats
4.3 Cavalry Tech Tree

The Cavalry Tech Tree unlocks and improves mounted units.

Requirements:

Stable branch must be unlocked from Barracks progression

Possible functions:

unlock cavalry equipment or mounts
improve movement speed and charge effectiveness
increase cavalry durability
reduce cavalry production cost or time
4.4 Tower Tech Tree

The Tower Tech Tree handles defensive tower progression.

For version one, the system will remain intentionally simple.

Version one tower model

There is only one base tower type.

This tower can be upgraded through three separate upgrade paths:

Attack Speed
Attack Damage
Attack Count
Path definitions

Attack Speed Path

increases rate of fire
tower attacks more often

Attack Damage Path

increases damage per projectile
tower becomes stronger against tougher enemies

Attack Count Path

increases the number of arrows/projectiles fired per attack cycle
useful for crowd control or wave defense

These tower upgrades should be treated as part of the Tower Tech Tree and can either be:

global tower unlocks, or
per-tower upgrade choices

For a simple first version, either approach is valid, but per-tower upgrade paths may create more tactical depth, while global upgrades are easier to implement.

5. Progression Model

The game progression should combine global unlocks and individual object behavior.

Global progression

Shared across the player:

technology tree unlocks
Barracks branch unlock state
available soldier equipment
tower upgrade availability
Local object behavior

Unique to each object:

building placement
health
unit training queue
tower target selection
tower chosen upgrade path, if pathing is per structure

This split keeps the progression system understandable:
the player unlocks options globally, then uses those options locally on the battlefield.

6. Recommended Data Model

To support the factory + decoder architecture, the game content can be divided into these main definition types:

BuildingDefinition

Contains:

building id
display name
cost
health
size
available actions
upgrade options
production capabilities
SoldierDefinition

Contains:

base unit id
base stats
base cost
base production time
allowed equipment slots
EquipmentDefinition

Contains:

equipment id
equipment type
stat modifiers
cost modifiers
time modifiers
unlock requirements
TechNodeDefinition

Contains:

tech id
tech tree category
prerequisites
effect type
effect value
TowerDefinition

Contains:

base tower stats
available upgrade branches
targeting behavior

This data-first structure makes the layout easier to maintain.

7. Version One Scope

To keep the first version focused, the game can be limited to the following:

Included
base building placement
Barracks production building
Barracks branching into Range or Stable unlock
shared Barracks upgrade progression
one base soldier system with equipment-based stat calculation
infantry, range, cavalry, and tower tech trees
one tower type
tower upgrades in three paths:
attack speed
attack damage
attack count
unit production cost/time based on equipment sum calculation
PvE defense gameplay loop
Deferred for later versions
multiple tower base types
unique soldier classes with special abilities
faction system
advanced tower targeting modes
branching building specializations beyond Barracks
hero or commander units
multiplayer or server-hosted systems
8. Simple System Relationship Summary

A very simple way to describe the game flow is:

Player unlocks tech
→ Tech unlocks equipment/building branches/upgrades
→ Buildings produce units or defenses
→ Units are generated from a base soldier + equipment + tech modifiers
→ Towers and armies defend against PvE invasions
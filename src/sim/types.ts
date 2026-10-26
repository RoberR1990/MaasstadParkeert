export type Config = Record<string, any>;
export type Role = 'monteur' | 'schoonmaker' | 'handhaver' | 'klantcontact';
export const ROLES: Role[] = ['monteur', 'schoonmaker', 'handhaver', 'klantcontact'];
export type TeamId = 'handhaving' | 'backoffice' | 'techniek' | 'schoonmaak' | 'klantcontact';
export const TEAMS: TeamId[] = ['handhaving', 'backoffice', 'techniek', 'schoonmaak', 'klantcontact'];
/** Team -> staff role. Backoffice & Bezwaar has no role in the legacy model; its FTE live in `teams.units.backoffice.fte`. */
export const TEAM_ROLE: Record<TeamId, Role | null> = { handhaving: 'handhaver', backoffice: null, techniek: 'monteur', schoonmaak: 'schoonmaker', klantcontact: 'klantcontact' };
export type HireRole = Role | 'backoffice';
export type AssetKind = 'garage' | 'automaat' | 'scanauto' | 'stalling' | 'nietjes' | 'pr' | 'hub';
export type Tariff = 'laag' | 'midden' | 'hoog';
export type Permit = 'ruim' | 'normaal' | 'krap';
export type Norm = 'hoog' | 'midden' | 'laag';

/** Generic effect: target is a dotted path into GameState (e.g. "wijken.centrum.visitors"). */
export interface Effect { target: string; op: 'add' | 'mul' | 'set'; value: number | string | boolean; durationQuarters?: number }
export interface ActiveEffect { target: string; undo: { op: 'add' | 'mul' | 'set'; value: any }; left: number }

export type Action =
  | { type: 'build'; asset: AssetKind; wijk?: string; count?: number; removeStreet?: boolean }
  | { type: 'setTariff'; wijk: string; level: Tariff }
  | { type: 'introducePaid'; wijk: string; level?: Tariff }
  | { type: 'setPermit'; wijk: string; level: Permit }
  | { type: 'setNorm'; wijk: string; level: Norm }
  | { type: 'ovPay'; wijk: string; on: boolean }
  | { type: 'lobby'; wijk: string }
  | { type: 'hire'; role: HireRole; n: number }
  | { type: 'fire'; role: Role; n: number }
  | { type: 'moment'; id: string; picks: string[] }
  | { type: 'dilemma'; id: string; choice: string }
  | { type: 'repair'; wijk: string; kind: 'garage' | 'stalling'; index: number };

/** One team's workload for the quarter just simulated (FTE-equivalents): demand + carried-over backlog = pool; capacity = fte. */
export interface TeamUnit { fte: number; demand: number; pool: number; done: number; achterstand: number; load: number; parts: Record<string, number> }
export interface MomentState { id: string; picks: string[]; /** how well each pick could be carried out (0-1): limited by the capacity of the teams it leans on */ eff: Record<string, number> }
export interface DilemmaState { id: string; choice: string; left: number }
export interface TeamsState {
  units: Record<TeamId, TeamUnit>;
  /** one-off workload added this quarter by actions (FTE-equivalents per team) */
  pulse: Record<TeamId, Record<string, number>>;
  malfPrev: number;
  moment: MomentState | null;
  dilemma: DilemmaState | null;
}

export interface Asset { cap: number; backlog: number; closed: boolean }

export interface WijkMetrics { demand: number; supply: number; bez: number; search: number; revenue: number; revGarage: number; revStreet: number; revPermit: number; visShare: number; waitShare: number; naleving: number; ov: number }

export interface Wijk {
  id: string; pop: number; carOwn: number; newPop: number; visitors: number;
  streetSpots: number; removedStreet: number; garages: Asset[]; stallings: Asset[];
  bikeSpots: number; bikeRacks: number; bikeDemand: number;
  paid: boolean; introLeft: number; tariff: Tariff; permit: Permit; norm: Norm;
  ovBase: number; ovPaying: boolean; ovPayQuarters: number;
  automaten: number; pr: number; hubs: number; lastPolicyQ: number; lastLobbyQ: number;
  m: WijkMetrics;
}

export interface QuarterRow {
  q: number; year: number; bewoner: number; ondernemer: number; bezoeker: number; fietser: number; stad: number; wethouder: number; blij: number;
  fonds: number; revenue: number; costs: number; opex: number; staffCost: number; overhead: number; backlog: number; closed: number; netheid: number; avgSearch: number; searchCentrum: number;
  dekking: number; naleving: number; klantBacklog: number; bikeShort: number; appShare: number; afgeroomd: number;
}

export interface GameState {
  quarter: number; rngState: number; seed: number;
  fonds: number; yearBudget: number; wageIndex: number; appShare: number; teamMood: number;
  staff: Record<Role, number>;
  hiring: { role: HireRole; n: number; left: number; orderedQ: number }[];
  queue: { asset: AssetKind; wijk: string | null; count: number; left: number; removeStreet: boolean }[];
  scanautos: number;
  wijken: Record<string, Wijk>;
  effects: ActiveEffect[];
  objections: number; klantBacklog: number;
  netheid: number; schoonRatioPrev: number;
  firstClosureQuarter: number | null; negFondsQuarters: number; afgeroomd: number;
  rejected: string[]; messages: string[];
  /** only present when `config.teams.enabled` (Jaar 1); the legacy 10-year model never touches it */
  teams?: TeamsState;
  history: QuarterRow[];
}

export interface Score { score: number; meanBlij: number; negFondsQuarters: number; backlogEnd: number; fondsEnd: number; afgeroomd: number; penalties: number; persona: Record<string, number> }

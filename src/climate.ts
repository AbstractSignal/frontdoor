/* The climate roster: seven units in three groups, with the label the page shows,
   the colour its curves get, and how far one click moves its setpoint.

   Declared here instead of discovered from HA. HA can tell an air conditioner from
   a heater — the ACs' hvac_modes carry cool, the heaters only know off/heat, measured
   2026-10-17 on HA 2026.9.1 — but it cannot tell a heated floor from a baseboard
   heater: both are `platform: homekit_controller`, and two of the five carry no name
   at all. The grouping and the labels are knowledge about the house, so they live
   here. A unit HA no longer has renders offline; a unit HA has gained stays invisible
   until it is added to this list. */

export type ClimateId = `climate.${string}`;

export interface Unit {
  id: ClimateId;
  labelKey: string;
  color: string;
}

export interface Group {
  id: string;
  labelKey: string;
  allKey: string;
  step: number;
  units: Unit[];
}

/* Colours are for the chart, where seven units share one plot: the hues stay apart,
   and the setpoint of each is the same hue dashed (see ClimateHistory). */
export const CLIMATE: Group[] = [
  {
    id: 'air',
    labelKey: 'group_air',
    allKey: 'all_air',
    step: 1,
    units: [
      { id: 'climate.salon', labelKey: 'unit_salon', color: '#60a5fa' },
      { id: 'climate.etage', labelKey: 'unit_etage', color: '#38bdf8' },
    ],
  },
  {
    id: 'floor',
    labelKey: 'group_floor',
    allKey: 'all_floor',
    step: 0.5,
    units: [
      { id: 'climate.th1310wf_b723d8', labelKey: 'unit_bath_masters', color: '#f43f5e' },
      { id: 'climate.th1310wf_b5de94', labelKey: 'unit_bath_main', color: '#fb923c' },
    ],
  },
  {
    id: 'baseboard',
    labelKey: 'group_baseboard',
    allKey: 'all_baseboard',
    step: 0.5,
    units: [
      { id: 'climate.th1123wf_a78bf0', labelKey: 'unit_masters_plinth', color: '#facc15' },
      { id: 'climate.chambre_auguste', labelKey: 'unit_auguste', color: '#34d399' },
      { id: 'climate.chambre_lionel_thermostat_lionel', labelKey: 'unit_lionel', color: '#c084fc' },
    ],
  },
];

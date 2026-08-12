import type { CrafterProfile } from '@frozen-rabbit-expert/domain'

/** Historical player-video profile. Keep this profile immutable so the
 * 37-step trace and the 4/72 regression result remain reproducible. */
export const TARGET_CRAFTER_722: Readonly<CrafterProfile> = {
  level: 100,
  craftsmanship: 5408,
  control: 5237,
  maxCp: 722,
  cosmicToolGoodBonus: true,
}

/** Current training profile after the player added a medicine that raises the
 * observed CP ceiling by 27. It is a separate benchmark, not a replacement for
 * the historical 722-CP evidence. */
export const TARGET_CRAFTER_MEDICINE_749: Readonly<CrafterProfile> = {
  ...TARGET_CRAFTER_722,
  maxCp: 749,
}

/** Specialist benchmark for the same medicine-adjusted stats. Keep this
 * separate from the non-specialist profile so specialist resources cannot
 * silently change historical or mainline benchmark results. */
export const TARGET_CRAFTER_SPECIALIST_MEDICINE_749: Readonly<CrafterProfile> = {
  ...TARGET_CRAFTER_MEDICINE_749,
  specialist: true,
}

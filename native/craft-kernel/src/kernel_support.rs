/// Version of the native/TypeScript parity contract.
pub const ORACLE_PARITY_VERSION: &str = "oracle-parity-v0.3";

const CONDITION_SEED_SALT: u32 = 0x43a9_b2f1;
const SUCCESS_SEED_SALT: u32 = 0x9e37_79b9;
const MULBERRY_INCREMENT: u32 = 0x6d2b_79f5;
const LEVEL_TABLE_100: u32 = 690;

fn mix_seed(mut value: u32) -> u32 {
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb_352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846c_a68b);
    value ^= value >> 16;
    value
}

/// Mulberry32 state with the same seed mixing and 32-bit wrapping as the
/// TypeScript oracle's `Math.imul` pipeline.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        let mixed = mix_seed(seed);
        Self {
            state: if mixed == 0 {
                MULBERRY_INCREMENT
            } else {
                mixed
            },
        }
    }

    /// Returns the raw unsigned output before the TypeScript oracle divides by
    /// `2^32` to form a unit-interval `number`.
    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(MULBERRY_INCREMENT);
        let mut next = self.state;
        next = (next ^ (next >> 15)).wrapping_mul(next | 1);
        next ^= next.wrapping_add((next ^ (next >> 7)).wrapping_mul(next | 61));
        next ^ (next >> 14)
    }

    pub fn next_unit_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) / 4_294_967_296.0
    }

    fn advance(&mut self, draws: u64) {
        self.state = self
            .state
            .wrapping_add(MULBERRY_INCREMENT.wrapping_mul(draws as u32));
    }
}

/// Independent condition and success streams derived exactly as in
/// `packages/simulator/src/randomStreams.ts`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EpisodeRandomStream {
    condition: Mulberry32,
    success: Mulberry32,
}

impl EpisodeRandomStream {
    pub fn new(seed: u32) -> Self {
        Self {
            condition: Mulberry32::new(seed ^ CONDITION_SEED_SALT),
            success: Mulberry32::new(seed ^ SUCCESS_SEED_SALT),
        }
    }

    pub fn next_condition_u32(&mut self) -> u32 {
        self.condition.next_u32()
    }

    pub fn next_success_u32(&mut self) -> u32 {
        self.success.next_u32()
    }

    pub fn next_condition(&mut self) -> f64 {
        self.condition.next_unit_f64()
    }

    pub fn next_success(&mut self) -> f64 {
        self.success.next_unit_f64()
    }

    /// Advances the condition generator without iterating through every
    /// discarded output. Mulberry32 changes only by its fixed increment, so
    /// this is exactly equivalent modulo its 32-bit state.
    pub fn advance_condition_draws(&mut self, draws: u64) {
        self.condition.advance(draws);
    }

    /// Advances the independent success generator to a supplied cursor.
    pub fn advance_success_draws(&mut self, draws: u64) {
        self.success.advance(draws);
    }
}

/// Input subset consumed by the TypeScript base-gain formulas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RecipeFormulaInput {
    pub recipe_level: u32,
    pub progress_divider: f64,
    pub quality_divider: f64,
    pub progress_modifier: f64,
    pub quality_modifier: f64,
}

/// Crafter stat subset consumed by the TypeScript base-gain formulas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CrafterFormulaInput {
    pub craftsmanship: f64,
    pub control: f64,
}

fn apply_level_modifier(base_value: f64, modifier: f64, recipe_level: u32) -> f64 {
    if LEVEL_TABLE_100 <= recipe_level {
        let adjusted = base_value * modifier;
        let hundredth = f64::from(0.01_f32);
        f64::from((adjusted * hundredth) as f32)
    } else {
        base_value.floor()
    }
}

pub fn calculate_base_progress(recipe: &RecipeFormulaInput, crafter: &CrafterFormulaInput) -> f64 {
    let base_value = (crafter.craftsmanship * 10.0) / recipe.progress_divider + 2.0;
    apply_level_modifier(base_value, recipe.progress_modifier, recipe.recipe_level)
}

pub fn calculate_base_quality(recipe: &RecipeFormulaInput, crafter: &CrafterFormulaInput) -> f64 {
    let base_value = (crafter.control * 10.0) / recipe.quality_divider + 35.0;
    apply_level_modifier(base_value, recipe.quality_modifier, recipe.recipe_level)
}

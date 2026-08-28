import {writeFileSync} from 'node:fs'
import {COSMIC_EXPERT_CATALOG_VERSION,GENERIC_EVALUATION_EQUIPMENT_PROFILES} from '@frozen-rabbit-expert/data'
import {cosmicEvaluationScenarios} from '../evaluate-generic-cosmic-families/matrix'

// Use the same canonical family/objective grouping as the native overnight input.
const families = cosmicEvaluationScenarios(null).map((s,index)=>({
  label:`F${String(index+1).padStart(2,'0')}`,familyId:s.family.familyId,
  representativeRecipeId:s.representativeRecipeId,recipeIds:s.recipeIds,
  objectiveSignature:s.objectiveUtilitySignature,
}))
writeFileSync(process.argv[2]!,JSON.stringify({
  catalogVersion:COSMIC_EXPERT_CATALOG_VERSION,
  families,equipment:GENERIC_EVALUATION_EQUIPMENT_PROFILES.map((e,index)=>({
    label:`E${String(index+1).padStart(2,'0')}`,...e,
  })),
},null,2)+'\n')

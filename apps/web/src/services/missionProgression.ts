import type { DeepReadonly } from 'vue'
import type { CosmicMission, MissionItem } from '@/types/missionData'

export function nextItemInMission(
  mission: DeepReadonly<CosmicMission>,
  currentRecipeId: number,
): DeepReadonly<MissionItem> | null {
  const currentIndex = mission.items.findIndex(item => item.recipeId === currentRecipeId)
  if (currentIndex < 0) return null
  return mission.items[currentIndex + 1] ?? null
}

export function nextSequentialMission(
  missions: readonly DeepReadonly<CosmicMission>[],
  mission: DeepReadonly<CosmicMission>,
  currentRecipeId: number,
): DeepReadonly<CosmicMission> | null {
  if (nextItemInMission(mission, currentRecipeId) || mission.nextMissionId === undefined) return null
  return missions.find(candidate => candidate.id === mission.nextMissionId) ?? null
}

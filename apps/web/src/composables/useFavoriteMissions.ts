import { ref, watch } from 'vue'

const STORAGE_KEY = 'frozen-rabbit-cosmic-favorite-missions'

function readFavoriteMissionIds(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
  } catch {
    return []
  }
}

const favoriteMissionIds = ref<number[]>(readFavoriteMissionIds())

watch(favoriteMissionIds, (ids) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}, { deep: true })

export function useFavoriteMissions() {
  const isFavorite = (missionId: number) => favoriteMissionIds.value.includes(missionId)
  const toggleFavorite = (missionId: number) => {
    favoriteMissionIds.value = isFavorite(missionId)
      ? favoriteMissionIds.value.filter(id => id !== missionId)
      : [...favoriteMissionIds.value, missionId]
  }

  return { favoriteMissionIds, isFavorite, toggleFavorite }
}

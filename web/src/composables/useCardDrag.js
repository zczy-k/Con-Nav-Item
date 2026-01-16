import { ref, computed, toRef, watch } from 'vue'
import { useSortable } from './useSortable'
import { useLongPress } from './useLongPress'
import { useOptimisticUpdate } from './useOptimisticUpdate'
import { useRequestQueue } from './useRequestQueue'
import { batchUpdateCards } from '../api'

export function useCardDrag(options = {}) {
  const {
    containerRef,
    cards,
    categoryId,
    subCategoryId,
    onSaveSuccess = () => {},
    onSaveError = () => {},
    onCardsReorder = null
  } = options

  const dragEnabled = ref(false)
  const showHint = ref(false)
  const isSaving = ref(false)
  const draggedCard = ref(null)

  const { execute: optimisticExecute } = useOptimisticUpdate()
  const requestQueue = useRequestQueue({ debounceMs: 500 })

  const sortableDisabled = computed(() => !dragEnabled.value)

  const { isPressed, isPending, handlePointerDown, cancel: cancelLongPress, reset: resetLongPress } = useLongPress({
    delay: 500,
    moveTolerance: 10,
    onLongPress: (event, target, card) => {
      dragEnabled.value = true
      showHint.value = true
      draggedCard.value = card

      if (navigator.vibrate) {
        navigator.vibrate(50)
      }

      sortable.enable()

      setTimeout(() => {
        showHint.value = false
      }, 1500)

      setTimeout(() => {
        if (target) {
          target.classList.add('sortable-chosen')
        }
      }, 50)
    },
    onCancel: () => {
      showHint.value = false
    }
  })

  const sortable = useSortable({
    containerRef,
    items: cards,
    itemKey: 'id',
    disabled: sortableDisabled,

    onStart: (item, index) => {
      draggedCard.value = item
    },

    onEnd: async (newOrder, oldOrder) => {
      const backup = cards.value ? [...cards.value] : []

      await optimisticExecute(
        () => {
          if (onCardsReorder) {
            onCardsReorder(newOrder.map(Number))
          }
          return backup
        },

        () => requestQueue.enqueueSort(
          () => saveOrder(newOrder),
          { newOrder, categoryId: categoryId?.value, subCategoryId: subCategoryId?.value }
        ),

        (backup) => {
          if (onCardsReorder && backup.length > 0) {
            onCardsReorder(backup.map(c => c.id))
          }
          onSaveError(new Error('保存失败，已恢复'))
        },

        {
          maxRetries: 2,
          retryDelay: 1000,
          onSuccess: () => {
            onSaveSuccess()
          },
          onError: (error, rollback) => {
            rollback()
          }
        }
      )

      setTimeout(() => {
        disableDragMode()
      }, 100)
    },

    onCancel: () => {
      disableDragMode()
    }
  })

  async function saveOrder(newOrder) {
    isSaving.value = true

    try {
      const updates = newOrder.map((id, index) => ({
        id: Number(id),
        order: index,
        menu_id: categoryId?.value,
        sub_menu_id: subCategoryId?.value || null
      }))

      await batchUpdateCards(updates)
      return true
    } finally {
      isSaving.value = false
    }
  }

  function enableDragMode() {
    dragEnabled.value = true
    sortable.enable()
  }

  function disableDragMode() {
    dragEnabled.value = false
    showHint.value = false
    draggedCard.value = null
    sortable.disable()
    resetLongPress()
  }

  function handleCardPointerDown(event, card) {
    handlePointerDown(event, card)
  }

  watch([categoryId, subCategoryId], () => {
    disableDragMode()
    sortable.reinit()
  })

  return {
    dragEnabled,
    showHint,
    isSaving,
    isDragging: sortable.isDragging,
    isPending,
    draggedCard,

    enableDragMode,
    disableDragMode,
    handleCardPointerDown,
    reinitSortable: sortable.reinit
  }
}

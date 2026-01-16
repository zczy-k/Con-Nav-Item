import { ref, watch, onUnmounted, nextTick } from 'vue'
import Sortable from 'sortablejs'

export function useSortable(options = {}) {
  const {
    containerRef,
    items,
    itemKey = 'id',
    disabled = ref(false),
    animation = 150,
    ghostClass = 'sortable-ghost',
    chosenClass = 'sortable-chosen',
    dragClass = 'sortable-drag',
    onStart = () => {},
    onEnd = () => {},
    onCancel = () => {}
  } = options

  let sortable = null
  const isDragging = ref(false)
  const originalOrder = ref([])

  const getCurrentOrder = () => {
    if (!items.value) return []
    return items.value.map(item => String(item[itemKey]))
  }

  const initSortable = () => {
    if (sortable || !containerRef.value) return

    sortable = new Sortable(containerRef.value, {
      animation,
      ghostClass,
      chosenClass,
      dragClass,
      delay: 0,
      delayOnTouchOnly: false,
      disabled: disabled.value,

      onStart: (evt) => {
        isDragging.value = true
        originalOrder.value = getCurrentOrder()
        const item = items.value[evt.oldIndex]
        onStart(item, evt.oldIndex, evt)
      },

      onEnd: (evt) => {
        isDragging.value = false

        const container = evt.to
        const newOrder = Array.from(container.children)
          .map(el => el.getAttribute('data-card-id') || el.getAttribute('data-id'))
          .filter(Boolean)

        const hasChanged = JSON.stringify(newOrder) !== JSON.stringify(originalOrder.value)

        if (hasChanged) {
          onEnd(newOrder, originalOrder.value, evt)
        } else {
          onCancel()
        }
      }
    })
  }

  const enable = () => {
    if (!sortable) {
      nextTick(() => initSortable())
    }
    if (sortable) {
      sortable.option('disabled', false)
    }
  }

  const disable = () => {
    if (sortable) {
      sortable.option('disabled', true)
    }
  }

  const destroy = () => {
    if (sortable) {
      sortable.destroy()
      sortable = null
    }
    isDragging.value = false
  }

  const reinit = () => {
    destroy()
    nextTick(() => {
      if (containerRef.value && !disabled.value) {
        initSortable()
      }
    })
  }

  watch(containerRef, (newRef) => {
    destroy()
    if (newRef && !disabled.value) {
      nextTick(() => initSortable())
    }
  })

  watch(disabled, (isDisabled) => {
    if (isDisabled) {
      disable()
    } else if (containerRef.value) {
      enable()
    }
  })

  onUnmounted(destroy)

  return {
    isDragging,
    originalOrder,
    enable,
    disable,
    destroy,
    reinit,
    getInstance: () => sortable
  }
}

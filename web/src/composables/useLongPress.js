import { ref, onUnmounted } from 'vue'

export function useLongPress(options = {}) {
  const {
    delay = 500,
    moveTolerance = 10,
    onLongPress = () => {},
    onCancel = () => {}
  } = options

  const isPressed = ref(false)
  const isPending = ref(false)

  let timer = null
  let startPos = { x: 0, y: 0 }
  let currentTarget = null

  const clear = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    isPending.value = false
  }

  const cancel = () => {
    clear()
    if (isPressed.value) {
      isPressed.value = false
      onCancel()
    }
  }

  const reset = () => {
    clear()
    isPressed.value = false
    currentTarget = null
  }

  const handlePointerDown = (event, card = null) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (event.ctrlKey || event.metaKey) return

    currentTarget = event.currentTarget
    startPos = { x: event.clientX, y: event.clientY }
    isPending.value = true

    timer = setTimeout(() => {
      isPressed.value = true
      isPending.value = false
      onLongPress(event, currentTarget, card)
    }, delay)

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
  }

  const handlePointerMove = (event) => {
    const dx = Math.abs(event.clientX - startPos.x)
    const dy = Math.abs(event.clientY - startPos.y)

    if (dx > moveTolerance || dy > moveTolerance) {
      cancel()
      removeGlobalListeners()
    }
  }

  const handlePointerUp = () => {
    clear()
    removeGlobalListeners()
  }

  const removeGlobalListeners = () => {
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)
    document.removeEventListener('pointercancel', handlePointerUp)
  }

  onUnmounted(() => {
    clear()
    removeGlobalListeners()
  })

  return {
    isPressed,
    isPending,
    handlePointerDown,
    cancel,
    reset
  }
}

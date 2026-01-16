import { ref } from 'vue'

export function useOptimisticUpdate() {
  const isPending = ref(false)
  const error = ref(null)

  async function execute(optimisticFn, asyncFn, rollbackFn, options = {}) {
    const { 
      onSuccess = () => {}, 
      onError = null, 
      onRollback = () => {},
      maxRetries = 0, 
      retryDelay = 1000 
    } = options

    const backup = optimisticFn()
    isPending.value = true
    error.value = null

    let retries = 0

    const attempt = async () => {
      try {
        const result = await asyncFn()
        isPending.value = false
        onSuccess(result)
        return result
      } catch (err) {
        if (retries < maxRetries) {
          retries++
          await new Promise(r => setTimeout(r, retryDelay))
          return attempt()
        }

        error.value = err
        isPending.value = false

        const performRollback = () => {
          rollbackFn(backup)
          onRollback()
        }

        if (onError) {
          onError(err, performRollback)
        } else {
          performRollback()
        }

        return null
      }
    }

    return attempt()
  }

  return {
    isPending,
    error,
    execute
  }
}

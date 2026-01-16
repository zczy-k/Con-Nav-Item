import { ref } from 'vue'

export function useRequestQueue(options = {}) {
  const { debounceMs = 300, maxConcurrent = 1 } = options

  const queue = ref([])
  const isProcessing = ref(false)
  const activeCount = ref(0)

  let debounceTimer = null
  let latestOrderData = null

  function enqueue(requestId, fn) {
    return new Promise((resolve, reject) => {
      const existingIndex = queue.value.findIndex(r => r.id === requestId)
      if (existingIndex > -1) {
        queue.value.splice(existingIndex, 1)
      }

      queue.value.push({
        id: requestId,
        fn,
        resolve,
        reject
      })

      scheduleProcess()
    })
  }

  function enqueueSort(fn, data) {
    latestOrderData = data

    return new Promise((resolve, reject) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        enqueue('sort-order', fn).then(resolve).catch(reject)
      }, debounceMs)
    })
  }

  function scheduleProcess() {
    if (isProcessing.value) return
    processQueue()
  }

  async function processQueue() {
    if (queue.value.length === 0 || activeCount.value >= maxConcurrent) {
      isProcessing.value = false
      return
    }

    isProcessing.value = true

    while (queue.value.length > 0 && activeCount.value < maxConcurrent) {
      const request = queue.value.shift()
      activeCount.value++

      try {
        const result = await request.fn()
        request.resolve(result)
      } catch (error) {
        request.reject(error)
      } finally {
        activeCount.value--
      }
    }

    isProcessing.value = false

    if (queue.value.length > 0) {
      processQueue()
    }
  }

  function cancelAll() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    queue.value.forEach(r => r.reject(new Error('Cancelled')))
    queue.value = []
  }

  function getLatestOrderData() {
    return latestOrderData
  }

  return {
    enqueue,
    enqueueSort,
    cancelAll,
    isProcessing,
    queueLength: () => queue.value.length,
    getLatestOrderData
  }
}

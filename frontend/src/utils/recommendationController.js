/**
 * Production recommendation session coordinator.
 * Tracks sequence monotonicity and binds responses strictly to active customer identity
 * to eliminate race conditions from delayed network packets or failed aborts.
 */
export function createRecommendationController({
  getCustomerId,
  onStartLoading,
  onSuccess,
  onError,
  fetchFn,
}) {
  let requestSeq = 0;
  let activeAbortCtrl = null;

  return {
    async fetch(params = {}) {
      const mySeq = ++requestSeq;
      const targetCustomer = typeof getCustomerId === 'function' ? getCustomerId() : null;

      if (activeAbortCtrl) {
        try {
          activeAbortCtrl.abort();
        } catch {
          // ignore
        }
      }
      activeAbortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;

      if (typeof onStartLoading === 'function') {
        onStartLoading();
      }

      try {
        const res = await fetchFn(params, { signal: activeAbortCtrl?.signal });

        // Guard: check sequence monotonicity and customer identity binding
        const currentActive = typeof getCustomerId === 'function' ? getCustomerId() : null;
        if (mySeq !== requestSeq || targetCustomer !== currentActive) {
          return null; // Discard stale or cross-account response
        }

        if (typeof onSuccess === 'function') {
          onSuccess(res);
        }
        return res;
      } catch (err) {
        if (err && err.name === 'AbortError') return null;

        const currentActive = typeof getCustomerId === 'function' ? getCustomerId() : null;
        if (mySeq !== requestSeq || targetCustomer !== currentActive) {
          return null; // Discard error from stale request
        }

        if (typeof onError === 'function') {
          onError(err);
        }
        return null;
      }
    },

    abort() {
      if (activeAbortCtrl) {
        try {
          activeAbortCtrl.abort();
        } catch {
          // ignore
        }
      }
    },

    getSeq() {
      return requestSeq;
    },
  };
}

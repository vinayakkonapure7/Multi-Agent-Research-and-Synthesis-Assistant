/**
 * Turns an axios error into a message a user can act on.
 *
 * `err.response` is only present when the server actually replied — if it's
 * missing, the request never reached the backend (it's down, or the network
 * dropped), which is a different problem than the server rejecting the
 * request, and deserves a different message.
 */
export function describeError(err, fallback = 'Something went wrong.') {
  if (!err?.response) {
    return 'Could not reach the server. Is the backend running on port 8000?'
  }
  return err.response?.data?.detail || fallback
}

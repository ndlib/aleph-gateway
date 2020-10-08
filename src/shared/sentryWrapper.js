'use strict'
const Sentry = require('@sentry/node')
const { errorResponse } = require('./response')

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE,
})

module.exports.sentryWrapper = (lambdaHandler) => {
  return async (event, context, callback) => {
    try {
      return await lambdaHandler(event, context, callback)
    } catch (error) {
      console.error(error)
      Sentry.captureException(error)
      await Sentry.close(2000)
      return errorResponse(callback, error)
    }
  }
}

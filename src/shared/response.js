const { t: typy } = require('typy')

module.exports.successResponse = (callback, body, statusCode) => {
  const response = {
    statusCode: statusCode || 200,
    body: body !== null ? JSON.stringify(body) : null,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'x-nd-version': process.env.VERSION,
    },
  }
  callback(null, response)
  return response
}

module.exports.errorResponse = (callback, error, statusCode) => {
  const response = {
    statusCode: statusCode || error.status || 500,
    body: typy(error).isString ? JSON.stringify({ errorMessage: error.toString() }) : null,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
      'x-nd-version': process.env.VERSION,
    },
  }
  const isTrueError = error instanceof Error
  callback(isTrueError ? error : null, response)
  return response
}

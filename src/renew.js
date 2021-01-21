const fetch = require('node-fetch')
const xml2js = require('xml2js')
const { t: typy } = require('typy')
const { requestHeaders, isAuthorized } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  let netid = typy(event, 'requestContext.authorizer.netid').safeString
  const params = typy(event, 'queryStringParameters').safeObjectOrEmpty
  const library = encodeURIComponent(params.library || process.env.DEFAULT_LIBRARY)
  const barcode = encodeURIComponent(params.barcode)

  if (!netid) {
    if (isAuthorized(event, callback)) {
      netid = params.netid
    } else {
      return
    }
  }

  if (!barcode) {
    console.error('Invalid request. Barcode is required.')
    return errorResponse(callback, null, 400)
  }

  const url = `${process.env.ALEPH_URL}/X?op=renew&library=${library}&bor_id=${netid}&item_barcode=${barcode}`
  const xmlParser = xml2js.Parser({
    tagNameProcessors: [xml2js.processors.stripPrefix],
    attrNameProcessors: [xml2js.processors.stripPrefix],
  })

  let error = null
  const result = await fetch(url, { method: 'POST', headers: requestHeaders })
    .then(response => {
      if (response.ok) {
        return response.text()
      } else {
        error = response
      }
    })
    .then(xmlString => (typy(xmlString).isString ? xmlParser.parseStringPromise(xmlString) : null))

  if (error) {
    return errorResponse(callback, null, error.status)
  }

  const response = (code, text) => {
    const body = {
      renewStatus: code,
      statusText: text,
    }
    return successResponse(callback, body, code)
  }

  // handle aleph errors
  const errorMessage = result.error || result['error-text-1'] || result['error-text-2']
  if (errorMessage) {
    if (errorMessage === "New due date must be bigger than current's loan due date") {
      return response(304)
    } else if (
      errorMessage.includes('can not be found in library') ||
      errorMessage.includes('is not Loaned in library')
    ) {
      return response(404)
    } else if (
      errorMessage.includes('has no Local Information') ||
      errorMessage.includes('Item provided is not loaned by given bor_id')
    ) {
      return response(500, 'Error in user information')
    }

    return response(500, errorMessage)
  }

  const dueDateStr = result['due-date']
  return successResponse(callback, response(200, {
    dueDate: `${dueDateStr.substring(0, 4)}-${dueDateStr.substring(4, 6)}-${dueDateStr.substring(6, 8)}`,
  }))
})

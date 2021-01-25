const fetch = require('node-fetch')
const xml2js = require('xml2js')
const { t: typy } = require('typy')
const { mapLoanItems, requestHeaders, isAuthorized } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  let netid = typy(event, 'requestContext.authorizer.netid').safeString
  const params = typy(event, 'queryStringParameters').safeObjectOrEmpty
  const library = encodeURIComponent(params.library || process.env.DEFAULT_LIBRARY)

  if (!netid) {
    if (isAuthorized(event, callback)) {
      netid = params.netid
    } else {
      return
    }
  }

  const url = `${process.env.ALEPH_URL}/X?op=bor_info&library=${library}&bor_id=${netid}&loans=Y`
  const xmlParser = xml2js.Parser({
    tagNameProcessors: [xml2js.processors.stripPrefix],
    attrNameProcessors: [xml2js.processors.stripPrefix],
  })

  let error = null
  const results = await fetch(url, { headers: requestHeaders })
    .then(response => {
      if (response.ok) {
        return response.text()
      } else {
        error = response
      }
    })
    .then(xmlString => (typy(xmlString).isString ? xmlParser.parseStringPromise(xmlString) : null))
  // API returns an HTML page on forbidden instead of a 403 status code... blech
  if (results.html) {
    console.error(JSON.stringify(results, null, 2))
    error = {
      status: 403,
    }
  }

  if (error) {
    return errorResponse(callback, null, error.status)
  }

  const items = typy(results, 'bor-info.item-l').safeArray
  return successResponse(callback, mapLoanItems(items))
})

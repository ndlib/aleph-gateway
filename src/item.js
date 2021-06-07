const AWSXRay = require('aws-xray-sdk-core')
AWSXRay.captureHTTPsGlobal(require('http'))
AWSXRay.captureHTTPsGlobal(require('https'))

const fetch = require('node-fetch')
const xml2js = require('xml2js')
const { t: typy } = require('typy')
const { requestHeaders, mapItem } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  AWSXRay.capturePromise() // Must be inside function handler

  const systemId = typy(event, 'pathParameters.systemId').safeString
  if (!systemId) {
    console.log('No system id provided.')
    return errorResponse(callback, null, 400)
  }

  const url = `${process.env.ALEPH_URL}/X?op=find-doc&base=ndu01pub&doc_num=${encodeURIComponent(systemId)}`
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
  if (results && results.html) {
    console.error(JSON.stringify(results, null, 2))
    error = {
      status: 403,
    }
  }

  if (error) {
    return errorResponse(callback, null, error.status)
  }

  const record = typy(results, 'find-doc.record[0]').safeObject
  const fields = typy(record, 'metadata[0].oai_marc[0].varfield').safeArray
  if (!fields.length) {
    return errorResponse(callback, null, 404)
  }

  const mapped = mapItem(record, systemId)
  return successResponse(callback, mapped)
})

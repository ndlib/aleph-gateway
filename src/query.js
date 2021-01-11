const fetch = require('node-fetch')
const xml2js = require('xml2js')
const { t: typy } = require('typy')
const { requestHeaders, mapItem } = require('./shared/helpers')
const { successResponse, errorResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  const params = typy(event, 'queryStringParameters').safeObjectOrEmpty
  const issn = params.issn
  const isbn = params.isbn
  const year = params.year

  if (!issn && !isbn) {
    console.error('Invalid request. Either issn or isbn query param is required.')
    return errorResponse(callback, null, 400)
  }

  const queryString = (isbn ? `020=${isbn}` : `022=${issn}`) + '+NOT+WTP=electronic+resource'
  const url = `${process.env.ALEPH_URL}/X?op=find&base=ndu01pub&request=${queryString}`
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

  if (error) {
    return errorResponse(callback, null, error.status)
  }

  const setNum = parseInt(typy(results, 'find.set_number[0]').safeString)
  const recordCount = parseInt(typy(results, 'find.no_records[0]').safeString)

  if (!setNum && !recordCount) {
    console.log('No record found matching query.')
    return errorResponse(callback, null, 404)
  }

  const path = `${process.env.ALEPH_URL}/X?op=present&base=ndu01pub&set_number=${setNum}&set_entry=1-${recordCount}`
  const data = await fetch(path, { headers: requestHeaders })
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

  if (!data) {
    console.log('No data found for entry')
    return errorResponse(callback, null, 204)
  }

  const validEntries = []
  typy(data, 'present.record').safeArray.forEach(record => {
    const fields = typy(record, 'metadata[0].oai_marc[0].varfield').safeArray

    // is valid entry if we're checking a book, or an article without a year
    let isValidEntry = isbn || !year

    // we want the year from the 866:a field
    // but we only care if we have an article and year to check against
    if (year && issn) {
      const { start, end } = startEndYears(fields)
      // if we have an article and a year, entry is only valid if given year is within range
      isValidEntry = (year >= start && year <= end)
    }

    if (isValidEntry) {
      // save this aleph id as valid entry
      validEntries.push(mapItem(record))
    }
  })

  if (!typy(validEntries).isArray) {
    return errorResponse(callback, null, validEntries)
  }

  return successResponse(callback, validEntries)
})

const startEndYears = (fields) => {
  // get start/end years for given serial
  let start = 9999
  let end = 0

  // All documented 866:a cases
  // 2004:no.1-2004:no.6
  // 1995-2004
  // 2003:winter-2003:spring
  // 1998:2-1998:4
  // 2005:stycz.-2005:luty=2485-2492
  // v.16(1994/1995)-v.19(2001/2002)
  // v.20:no.1(2002:July)-v.20:no.2(2002:Nov.)
  // v.275:no.8728(1995:Oct.21)-v.280:no.8844(1998:Feb.7)
  // v.1:no.1(1967)-v.8:no.3(2004)
  // v.25:no.25(2001:out.16/24)-v.26:no.15(2002:maio 16/XX)

  // Years are:
  // a. inside parens
  // b. no parens:
  //   before an "="
  //     1. the start of a string
  //     2. directly follows a dash
  //     3. directly follows a slash

  // to get everything within parentheses
  const parensRegex = /\(([\d]{4}).*?\)/g
  // get sequences of 4 numbers, these should be years (used on data from parensRegex)
  const yearRegex = /([\d]{4})/
  // Should match \A = start of string, / or - and then 4 numbers (the year)
  const noParensRegex = /[\\A/-]([\d]{4})/

  for (let i = 0; i < fields.length; i++) {
    const fieldId = typy(fields[i], '$.id').safeString
    const subfields = typy(fields[i], 'subfield').safeArray

    switch (fieldId) {
      case '852':
        for (let j = 0; j < subfields.length; j++) {
          const label = typy(subfields[j], '$.label').safeString
          const value = typy(subfields[j], '_').safeString

          if (label === 'z' && value === 'Currently received') {
            end = 9999
          }
        }
        break
      case '866':
        for (let j = 0; j < subfields.length; j++) {
          const label = typy(subfields[j], '$.label').safeString
          const value = typy(subfields[j], '_').safeString

          if (label === 'a') {
            // if there are parens, year is inside them
            if (value.includes('(')) {
              const dates = value.match(parensRegex)
              if (dates && dates.length) {
                dates.forEach(date => {
                  const year = parseInt(date.match(yearRegex)[0])
                  start = Math.min(start, year)
                  end = Math.max(end, year)
                })
              }
            } else {
              // split on "=" to be correct in the following case
              // 2005:stycz.-2005:luty=2485-2492
              const split = value.split('=')[0]
              const year = parseInt(split.match(noParensRegex)[1]) // Group 1, as opposed to full match
              start = Math.min(start, year)
              end = Math.max(end, year)
            }
          }
        }
        break
    }
  }

  return {
    start,
    end,
  }
}

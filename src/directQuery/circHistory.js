const { t: typy } = require('typy')
const { successResponse } = require('../shared/response')
const { sentryWrapper } = require('../shared/sentryWrapper')
const { isAuthorized } = require('../shared/helpers')
const { connect } = require('./connection')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  let netid = typy(event, 'requestContext.authorizer.netid').safeString
  const params = typy(event, 'queryStringParameters').safeObjectOrEmpty

  // Request validation
  if (!netid) {
    if (isAuthorized(event, callback)) {
      netid = params.netid
    } else {
      return
    }
  }

  const data = await exports.queryCircHistory(netid)
  return successResponse(callback, data)
})

module.exports.queryCircHistory = async (netid) => {
  let connection
  let result

  try {
    connection = await connect()

    result = await connection.execute(
      `
        SELECT
          z36_rec_key, z36_number, z36_loan_date, z36_returned_date, z36_due_date, z36_material,
          z13_rec_key, z13_author, z13_title, z13_imprint, z13_year,
          isbn,
          issn,
          z30_barcode, z30_call_no, z30_description,
          edition,
          institution
        FROM ndrep.circ_history_mv
        WHERE netid = UPPER(:netID)
      `,
      [netid],
    )
  } finally {
    if (connection) {
      await connection.close()
    }
  }

  const columns = [
    'adm_number',
    'loan_number',
    'loan_date',
    'return_date',
    'due_date',
    'material',
    'bib_number',
    'author',
    'title',
    'publisher',
    'year_published',
    'isbn',
    'issn',
    'barcode',
    'call_number',
    'volume',
    'edition',
    'institution',
  ]

  return typy(result, 'rows').safeArray.map(row => {
    const rowData = {}
    for (let i = 0; i < columns.length; i++) {
      const columnName = columns[i]
      rowData[columnName] = row[i] || '' // Disallow nulls. Return empty string.
    }
    return rowData
  })
}

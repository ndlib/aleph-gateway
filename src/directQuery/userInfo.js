const { t: typy } = require('typy')
const { successResponse, errorResponse } = require('../shared/response')
const { sentryWrapper } = require('../shared/sentryWrapper')
const { isAuthorized } = require('../shared/helpers')
const { connect } = require('./connection')
const alephMappings = require('../config/alephMappings.json')

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

  const data = await exports.queryUserInfo(netid)
  if (!data) {
    console.error(`No aleph account found for netid '${netid}'.`)
    return errorResponse(callback, null, 404)
  }

  return successResponse(callback, data)
})

module.exports.queryUserInfo = async (netid) => {
  let connection
  let result

  try {
    connection = await connect()

    result = await connection.execute(
      `
        SELECT
          aleph_id,
          patron_name,
          home_library,
          local_address_line_1,
          local_address_line_2,
          local_address_line_3,
          local_address_line_4,
          local_address_zip,
          local_email_address,
          local_address_telephone,
          local_address_telephone_2,
          open_date,
          last_update_date,
          expiry_date,
          bor_status,
          bor_type,
          loan_permission,
          hold_permission,
          renew_permission,
          nd_balance + hc_balance AS balance,
          SUBSTR(campus_id, 1, 3) AS campus,
          SUBSTR(campus_id, 4) AS campus_id
        FROM ndrep.patron_mv
        WHERE netid = UPPER(:netID)
      `,
      [netid],
    )
  } finally {
    if (connection) {
      await connection.close()
    }
  }

  if (!result || !result.rows || !result.rows.length) {
    return null
  }

  const columns = [
    'alephId',
    'name',
    'homeLibraryCode',
    'address1',
    'address2',
    'address3',
    'address4',
    'zip',
    'emailAddress',
    'telephone',
    'telephone2',
    'openDate',
    'updateDate',
    'expiryDate',
    'borrowerStatusCode',
    'borrowerTypeCode',
    'loanPermission',
    'holdPermission',
    'renewPermission',
    'balance',
    'campus',
    'campusId',
  ]

  const outData = {}
  const values = result.rows[0]
  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i]
    // convert Y/N flag columns to booleans for easier consumption
    if (['loanPermission', 'holdPermission', 'renewPermission'].includes(columnName)) {
      outData[columnName] = (values[i] === 'Y')
    } else {
      outData[columnName] = values[i] || '' // Disallow nulls. Return empty string.
    }
  }

  // if we didn't find an aleph account for the netid, don't bother continuing.
  if (!outData.alephId) {
    return null
  }

  // map codes to descriptions and save them as separate fields
  const homeLibrary = alephMappings.HOMELIBRARY[outData.homeLibraryCode]
  if (homeLibrary) {
    outData.homeLibrary = homeLibrary
  }
  const borrowerStatus = alephMappings.BORSTATUS[outData.borrowerStatusCode]
  if (borrowerStatus) {
    outData.status = borrowerStatus
  }
  const borrowerType = alephMappings.BORTYPE[outData.borrowerTypeCode]
  if (borrowerType) {
    outData.type = borrowerType
  }

  return outData
}

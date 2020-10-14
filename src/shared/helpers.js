const { t: typy } = require('typy')
const { errorResponse } = require('./response')

module.exports.requestHeaders = {
  'Content-Type': 'application/xml',
}

module.exports.mapLoanItems = (items) => {
  const LOAN_TYPE = 'loan'
  const PHOTO_TYPE = 'photo'

  return typy(items).safeArray.map(item => {
    const type = (item.RequestType === 'Loan' ? LOAN_TYPE : PHOTO_TYPE)
    const output = {
      type: type,
      dueDate: (item.DueDate ? item.DueDate.split('T')[0] : ''), // 2017-06-28T00:00:00 => 2017-06-28
      status: item.TransactionStatus,
      transactionNumber: item.TransactionNumber,
      transactionDate: item.TransactionDate,
      creationDate: item.CreationDate,
      callNumber: item.CallNumber,
      issn: item.ISSN,
      illNumber: item.ILLNumber,
      documentType: item.DocumentType,
    }

    if (type === LOAN_TYPE) {
      Object.assign(output, {
        title: item.LoanTitle,
        author: item.LoanAuthor,
        edition: item.LoanEdition,
        publisher: item.LoanPublisher,
        placeOfPublication: item.LoanPlace,
        publicationDate: item.LoanDate,
        journalTitle: '',
        journalVolume: '',
        journalIssue: '',
        journalMonth: '',
        journalYear: '',
      })
    } else if (type === PHOTO_TYPE) {
      Object.assign(output, {
        title: item.PhotoArticleTitle,
        author: item.PhotoArticleAuthor,
        edition: item.PhotoItemEdition,
        publisher: item.PhotoItemPublisher,
        placeOfPublication: item.PhotoItemPlace,
        publicationDate: item.PhotoItemDate,
        journalTitle: item.PhotoJournalTitle,
        journalVolume: item.PhotoJournalVolume,
        journalIssue: item.PhotoJournalIssue,
        journalMonth: item.PhotoJournalMonth,
        journalYear: item.PhotoJournalYear,
      })
    }

    return output
  })
}

module.exports.isAuthorized = (event, callback) => {
  const clientid = typy(event, 'requestContext.authorizer.clientid').safeString
  const authorizedClients = process.env.AUTHORIZED_CLIENTS.split(',')

  if (!clientid) {
    console.error('Invalid token or no token provided')
    errorResponse(callback, null, 400)
  } else if (!authorizedClients.includes(clientid)) {
    console.error(`Okta client ${clientid} is not authorized to perform this action.`)
    errorResponse(callback, null, 401)
  } else {
    // Client IS authorized to fetch info for any netid, so use netid from query string
    if (typy(event, 'queryStringParameters.netid').safeString) {
      return true
    } else {
      console.error('Client is authorized but no netid specified.')
      errorResponse(callback, null, 400)
    }
  }

  // Unless we returned true, default to false
  return false
}

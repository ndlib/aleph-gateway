const { t: typy } = require('typy')
const { errorResponse } = require('./response')

module.exports.requestHeaders = {
  'Content-Type': 'application/xml',
}

module.exports.mapItem = (record, systemId = '') => {
  // This is the response structure. Values will be populated as we go
  const output = {
    name: '',
    docNumber: systemId || typy(record, 'doc_number[0]').safeString.trim(),
    description: '',
    purl: '',
    urls: [],
    relatedResources: [],
    access: '',
    accessNotes: '',
    includes: '',
    platform: '',
    publisher: '',
    provider: '',
  }

  // As an example of what we're matching
  // This is the marc xml
  // <varfield id="730" i1="0" i2=" ">
  //   <subfield label="a">Literature online.</subfield>
  // </varfield>
  // often we don't care about i1 or i2, only id and the subfield with label "a"
  // but sometimes we must match i1 and/or i2 to make sure we're getting useful information to display
  // Some fields can have multiple entries, eg: 856
  // for this we must iterate over all the entries

  const fields = typy(record, 'metadata[0].oai_marc[0].varfield').safeArray

  output.name = trimExtended(getRecordValue(fields, 245, null, null, 'a'))

  const descriptionFields = getRecordValue(fields, 520)
  // Out of all 520 records, prefer the one that has a subfield 9 of value g
  let descriptionField = descriptionFields.find(desc => {
    return typy(desc, 'subfield').safeArray.find(subf => {
      return typy(subf, '$.label').safeString === '9' && typy(subf, '_').safeString === 'g'
    })
  })
  // If we didn't find one with the magical 9 and g, just use the first one
  if (!descriptionField && descriptionFields.length) {
    descriptionField = descriptionFields[0]
  }
  // The actual description value is in subfield a
  output.description = getRecordValue(descriptionField, null, null, null, 'a')
  output.purl = getRecordValue(fields, 856, 4, 0, 'u')

  // all urls with titles and notes
  const urls = []
  getRecordValue(fields, 856, 4, 0).forEach(link => {
    urls.push({
      url: getRecordValue(link, null, null, null, 'u'),
      title: getRecordValue(link, null, null, null, '3'),
      notes: getRecordValue(link, null, null, null, 'z'),
    })
  })
  output.urls = urls

  // same format as urls, but goes into its own field since its use is different
  const relatedResources = []
  getRecordValue(fields, 856, 4, 2).forEach(related => {
    relatedResources.push({
      url: getRecordValue(related, null, null, null, 'u'),
      title: getRecordValue(related, null, null, null, '3'),
      notes: getRecordValue(related, null, null, null, 'z'),
    })
  })
  output.relatedResources = relatedResources

  // access data
  const letters = ['f', 'a', 'c']
  // This loop comes first because we want all f subfield values first, then a, etc.
  letters.forEach(letter => {
    getRecordValue(fields, 506).forEach(record => {
      const value = trimExtended(getRecordValue(record, null, null, null, letter))
        .replace('Online access with authorization', 'Notre Dame faculty, staff, and students')
        .replace('Access restricted to subscribers', 'Notre Dame faculty, staff, and students')
        .replace('Restricted to subscribing institutions', 'Notre Dame faculty, staff, and students')
        .replace('Subscription required for access', 'Notre Dame faculty, staff, and students')
        .replace('Restricted to users with valid Notre Dame NetIDs', 'Notre Dame faculty, staff, and students')
        .replace('Unrestricted online access', 'Public')

      if (value) {
        output.access = (output.access ? `${output.access}\n` : '') + value
      }
    })
  })

  // Additional notes about access. Unlike the above field, this is not validated against any list of expected values.
  const notesValue = getRecordValue(fields, 538, null, null, 'a')
  output.accessNotes = notesValue.includes('World Wide Web') ? '' : notesValue

  // includes
  output.includes = trimExtended(getRecordValue(fields, 740, null, 2, 'a'))

  // meta (platform, publisher, provider)
  getRecordValue(fields, 710, null, ' ').forEach(meta => {
    const sub4 = getRecordValue(meta, null, null, null, 4)
    const metaValue = getRecordValue(meta, null, null, null, 'a')

    if (sub4 === 'pltfrm') {
      output.platform = (output.platform ? `${output.platform}\n` : '') + metaValue
    } else if (sub4 === 'pbl') {
      output.publisher = (output.publisher ? `${output.publisher}\n` : '') + metaValue
    } else if (sub4 === 'prv') {
      output.provider = (output.provider ? `${output.provider}\n` : '') + metaValue
    }
  })

  return output
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

const trimExtended = (string) => {
  // Remove all instances of spaces and periods at the beginning or end of the string
  // Ex: "  .this is a test. Look at my example." => "this is a test. Look at my example"
  return string.replace(/^[\\. ]+|[\\. ]+$/g, '')
}

const getRecordValue = (fields, fieldId, i1, i2, subfieldId) => {
  const filteredFields = typy(fields).safeArray.filter(field => {
    const attributes = typy(field, '$').safeObjectOrEmpty
    return (
      (!fieldId || attributes.id === fieldId.toString()) &&
      (!i1 || attributes.i1 === i1.toString()) &&
      (!i2 || attributes.i2 === i2.toString())
    )
  })
  if (!subfieldId) {
    return filteredFields
  }

  const filteredSubfields = []
  filteredFields.forEach(field => {
    const subfield = typy(field, 'subfield').safeArray.find(subf => {
      return typy(subf, '$.label').safeString === subfieldId.toString()
    })
    if (subfield) {
      filteredSubfields.push(subfield)
    }
  })
  const values = filteredSubfields.map(subfield => typy(subfield, '_').safeString.trim()).filter(value => value)
  return values.join('\n')
}

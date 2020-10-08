const fs = require('fs')
const os = require('os')
const oracledb = require('oracledb')

module.exports.connect = async () => {
  // oracle requires the machine name must be the same as the hosts file entry for 127.0.0.1
  // this is used by the client to create a unique id to connect to the db with
  // taken from https://stackoverflow.com/questions/39201869/aws-python-lambda-with-oracle-oid-generation-failed
  const hostname = os.hostname()
  fs.appendFileSync('/tmp/HOSTALIASES', `${hostname} localhost\n`)
  process.env.HOSTALIASES = '/tmp/HOSTALIASES'

  const connectionString = `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${process.env.ALEPH_ORACLE_HOST})(PORT=${process.env.ALEPH_ORACLE_PORT}))(CONNECT_DATA=(SERVER=DEDICATED)(SID=${process.env.ALEPH_ORACLE_SID})))`
  console.log('Attempting to connect to:', connectionString)

  return oracledb.getConnection({
    user: process.env.ALEPH_ORACLE_USER,
    password: process.env.ALEPH_ORACLE_PWD,
    connectString: connectionString,
    externalAuth: false,
  })
}

import bitcoinTransaction from 'bitcoin-transaction'
import crypto from 'crypto'
import { cipher, db } from '../utils/globals.js'
import { generateWallet, getBtcBalance } from '../blockchain/btc.js'
import pkg from 'mongodb'
import  staticSalt  from '../secret/index.js'
import * as bitcoin from 'bitcoinjs-lib'
import axios from 'axios'

const { ObjectId } = pkg;

/**
 * Checks if this name is unique
 *
 * @param {string} name Name provided during registration attempt
 * @throws {'name_occupied'} If the name is already taken
 */
async function isNameUnique (name) {
  const result = await db.collection('users').findOne({ name: name })
  if (result) {
    throw Error('name_occupied')
  }
}

/**
 * Checks if this email is registered
 *
 * @param {string} email Email address provided during registration attempt
 * @throws {'email_occupied'} If the email address is already taken
 */
async function isEmailRegistered (email) {
  const result = await db.collection('users').findOne({ email: email })
  if (!result) {
    throw Error('email_not_registered')
  }
}

/**
 * Checks if this email is unique
 *
 * @param {string} email Email address provided during registration attempt
 * @throws {'email_occupied'} If the email address is already taken
 */
async function isEmailUnique (email) {
  const result = await db.collection('users').findOne({ email: email })
  if (result) {
    throw Error('email_occupied')
  }
}

/**
 * Checks username format. The username must be between 4 and 25 characters long and must not contain the “@” character
 *
 * @param {string} name Username
 * @throws {'name_incorrect'} If the username is incorrect
 */
function validateName (name) {
  if (!(name !== undefined && Object.prototype.hasOwnProperty.call(name, 'length') && name.length >= 4 && name.length <= 25 && !name.includes('@'))) {
    throw Error('name_incorrect')
  }
}

/**
 * Checks the format of the email address
 *
 * @param {string} email Email address
 * @throws {'email_incorrect'} If the email address is incorrect
 */
function validateEmail (email) {
  var re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  if (!(email !== undefined && re.test(email))) {
    throw Error('email_incorrect')
  }
}

/**
 * Checks password format. Password must be between 8 and 25 character long
 *
 * @param {string} password Password
 * @throws {'password'} If the password format is incorrect
 */
function validatePassword (password) {
  if (!(password !== undefined && Object.prototype.hasOwnProperty.call(password, 'length') && password.length >= 8 && password.length <= 25)) {
    throw Error('password')
  }
}

/**
 * Checks session key format. Session key must be 32 characters long
 *
 * @param {string} session Session key
 * @throws {'session'} If the session format is incorrect
 */
function validateSession (session) {
  if (!(session !== undefined && Object.prototype.hasOwnProperty.call(session, 'length') && session.length === 32)) {
    throw Error('session')
  }
}

/**
 * Read user data from the database
 *
 * @param {string} login Name or email address
 * @returns {Object} User data
 */
async function readData (login) {
  return await db.collection('users').findOne({ $or: [{ name: login }, { email: login }] })
}

function generateRandomString (length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const charactersLength = characters.length

  let result = ''
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

/**
 * Creates a 32-character session key consisting of latin letters and numbers. Writes a key to the database and returns it
 *
 * @param {string} login Name or email address
 * @returns {string} Session key
 */
async function startSession (login) {
  const session = generateRandomString(32)
  await db.collection('users').updateOne({ $or: [{ name: login }, { email: login }] }, { $set: { session: session } })
  return session
}

/**
 * Verifies the session key
 *
 * @param {string} userId User ID
 * @param {string} session Session key
 * @throws {'name_incorrect'} If there is no user with this id
 * @throws {'session'} If the session key is invalid
 */
export async function checkSession (userId, session) {
  validateSession(session)

  const result = await db.collection('users').findOne({ _id: new ObjectId(userId) })
  if (!result) {
    throw Error('name_incorrect')
  } else if (session !== result.session) {
    throw Error('session')
  }
}

/**
 * Verifies password
 *
 * @param {string} login User login
 * @param {string} password User password
 * @throws {'password'} If the password is incorrect
 */
export async function checkEmailAndPassword (email, password) {
  const result = await db.collection('users').findOne({ email }, { projection: { password: 1, dynamicSalt: 1 } })
  const hash = crypto.createHash('sha256')
  if (!result) {
    throw Error('login')
  } else if (hash.update(password + staticSalt + result.dynamicSalt).digest('hex') !== result.password) {
    throw Error('password')
  }
}

/**
 * Verifies password
 *
 * @param {string} login User login
 * @param {string} password User password
 * @throws {'password'} If the password is incorrect
 */
export async function checkNameAndPassword (name, password) {
  const result = await db.collection('users').findOne({ name }, { projection: { password: 1, dynamicSalt: 1 } })
  const hash = crypto.createHash('sha256')
  if (!result) {
    throw Error('login')
  } else if (hash.update(password + staticSalt + result.dynamicSalt).digest('hex') !== result.password) {
    throw Error('password')
  }
}

/**
 * Ends a user session. Nullifies the current session key
 *
 * @param {string} userId User id
 */
export async function endSession (userId) {
  await db.collection('users').updateOne({ _id: new ObjectId(userId) }, { $set: { session: null } })
}

/**
 * User registration
 *
 * @param {Object} req Request object
 * @returns {Object} User info and session key
 */
export async function register (req) {
  validateName(req.body.name)
  validateEmail(req.body.email)
  validatePassword(req.body.password)
  await isNameUnique(req.body.name)
  await isEmailUnique(req.body.email)

  const dynamicSalt = generateRandomString(8)
  const hash = crypto.createHash('sha256')

  await db.collection('users').insertOne({
    registrationDateTime: new Date(),
    name: req.body.name,
    email: req.body.email,
    dynamicSalt,
    password: hash.update(req.body.password + staticSalt + dynamicSalt).digest('hex'),
    guests: [],
    balance: {
      virtual: 10,
      real: 0
    },
    gamesHistory: {
      virtual: [],
      real: []
    },
    btc: {
      wallet: generateWallet(),
      deposits: [],
      withdraws: [],
      affilation: [],
      deposited: 0
    },
    expiration: new Date().getTime()
  })
  const data = await readData(req.body.name)
  data.session = await startSession(req.body.name)
  return data
}


/**
 * User login
 *
 * @returns {Object} User info and session key
 */
export async function login (req) {
  await checkEmailAndPassword(req.body.login, req.body.password)
  const data = await readData(req.body.login)
  data.session = await startSession(req.body.login)
  return data
}

/**
 * Logout user
 */
export async function logout (req) {
  await checkSession(req.body.userId, req.body.session)
  await endSession(req.body.userId)
}

/**
 * Write page visitor to database
 */
export function logVisitor (req) {
  db.collection('visitors').insertOne({
    ip: req.ip,
    from: req.headers.referer,
    to: req.path,
    uid: req.headers['user-agent'],
    time: new Date()
  })
}

/**
 * Change user email
 */
export async function changeEmail (req) {
  await checkSession(req.cookies.user_id, req.cookies.session)
  await checkNameAndPassword(req.cookies.name, req.body.password)
  validateEmail(req.body.email)
  isEmailUnique(req.body.email)
  await db.collection('users').updateOne({ _id: new ObjectId(req.cookies.user_id) }, { $set: { email: req.body.email } })
}

/**
 * Change user password
 */
export async function changePassword (req) {
  await checkSession(req.cookies.user_id, req.cookies.session)
  await checkNameAndPassword(req.cookies.name, req.body.oldPassword)
  try {
    validatePassword(req.body.newPassword)

    const newDynamicSalt = generateRandomString(8)

    const hash = crypto.createHash('sha256')

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.cookies.user_id) },
      { $set: { password: hash.update(req.body.newPassword + staticSalt + newDynamicSalt).digest('hex'), dynamicSalt: newDynamicSalt } })
  } catch (e) {
    throw Error('new_password')
  }
}


/**
 * Get info for profile pages
 */
export async function usersInfo (req) {
  const data = await db.collection('users').find().project({ _id: 0, name: 1, gamesHistory: 1, balance: 1, referral: 1, 'btc.wallet.publicAddress': 1, expiration: 1 }).toArray()

  return {
    allUsersData: data.map(i => {
      i.btc.wallet.publicAddress = cipher.decrypt(i.btc.wallet.publicAddress)
      if (req.body.historySize) {
        i.realGames = i.gamesHistory.real.length
        i.realWins = i.gamesHistory.real.filter(j => j.crash === 'x').length
        i.realLosses = i.gamesHistory.real.filter(j => j.stop === 'x').length
        if (i.gamesHistory.real.length > req.body.historySize) {
          i.gamesHistory.real = i.gamesHistory.real.slice(i.gamesHistory.real.length - req.body.historySize)
        }
        i.virtualGames = i.gamesHistory.virtual.length
        i.virtualWins = i.gamesHistory.virtual.filter(j => j.crash === 'x').length
        i.virtualLosses = i.gamesHistory.virtual.filter(j => j.stop === 'x').length
        if (i.gamesHistory.virtual.length > req.body.historySize) {
          i.gamesHistory.virtual = i.gamesHistory.virtual.slice(i.gamesHistory.virtual.length - req.body.historySize)
        }
      }
      return i
    })
  }
}


/**
 * Get deposits and send btc to shared wallet
 */
export async function checkDeposits (req) {
  const deposits =
    (await db.collection('users').find().project({ _id: 0, 'btc.wallet.publicAddress': 1, 'btc.deposited': 1, inviter: 1, name: 1, email: 1, 'btc.wallet.privateKeyWIF': 1 }).toArray())
      .map(i => { return { address: cipher.decrypt(i.btc.wallet.publicAddress), recieved: i.btc.deposited, inviter: i.inviter, name: i.name, email: i.email, wif: cipher.decrypt(i.btc.wallet.privateKeyWIF) } })

  const data = await getBtcBalance(deposits)

  data.forEach(i => {
    if (i.total_received > i.recieved * 100) {
      const tx = new bitcoin.TransactionBuilder()
      tx.addInput(i.transaction_hash, i.transaction_index)
      tx.addOutput(require('../../secret/secret').publicAddress, i.final_balance - 1500)
      tx.sign(0, bitcoin.ECPair.fromWIF(i.wif))
      const transactionHex = tx.build().toHex()

      axios
        .post('https://api.blockcypher.com/v1/btc/main/txs/push', {
          tx: transactionHex
        })
        .then((res) => {
          console.log(`statusCode: ${res.statusCode}`)
          console.log(res)

          writeDepositDataToDB(i)
        })
        .catch((error) => {
          console.error(error)
          db.collection('manual_transactions').insertOne({
            rawTx: transactionHex,
            email: i.email,
            date: new Date(),
            pushed: false
          })

          writeDepositDataToDB(i)
        })
    }
  })
}

function writeDepositDataToDB (i) {
  const amount = parseInt(((i.total_received - i.recieved - 1500) / 100).toFixed(0))
  db.collection('users').updateOne({ email: i.email }, { $inc: { 'btc.deposited': amount, 'balance.real': amount } })
  db.collection('users').updateOne({ email: i.email }, { $push: { 'btc.deposits': { id: generateRandomString(8), amount, date: new Date() } } })
  if (i.inviter) {
    db.collection('users').updateOne({ _id: new ObjectId(i.inviter) }, { $inc: { 'balance.real': amount * 0.03 } })
    db.collection('users').updateOne({ _id: new ObjectId(i.inviter) }, { $push: { 'btc.affilation': { date: new Date(), amount: amount * 0.03, name: i.name, email: i.email } } })
  }
}

/**
 * Withdraw bitcoins from account
 */
export async function withdraw (req) {
  await checkSession(req.cookies.user_id, req.cookies.session)
  await checkNameAndPassword(req.cookies.name, req.body.password)

  const data = await db.collection('users').findOne({ name: req.cookies.name }, { _id: 0, 'balance.real': 1 })

  if (req.body.amount < 1) {
    throw new Error('less than 1')
  }

  if (data.balance.real >= req.body.amount) {
    const from = require('./secret/secret').publicAddress
    const to = req.body.publicAddress
    const privateKeyWIF = require('./secret/secret').privateKeyWIF

    bitcoinTransaction.getBalance(from, { network: 'mainnet' }).then(() => {
      return bitcoinTransaction.sendTransaction({
        from,
        to,
        privateKeyWIF,
        btc: req.body.amount / 1000000,
        network: 'mainnet'
      })
    })

    db.collection('users').updateOne({ name: req.cookies.name }, { $set: { 'btc.withdraws': { date: new Date(), amount: req.body.amount, address: req.body.publicAddress } } })
    return {
      date: new Date(),
      amount: req.body.amount,
      address: req.body.publicAddress
    }
  }
}

/**
 * Get guests list for profile/affilate page
 */
export async function getIncomesFromReferrals (req) {
  const data = await db.collection('users').findOne({ name: req.params.name })

  return {
    data: data.btc.affilation.map(i => {
      return {
        date: i.date,
        name: i.name,
        amount: i.amount
      }
    })
  }
}

/**
 * Get incomes list for profile/affilate page
 */
export async function getReferrals (req) {
  const data = await db.collection('users').findOne({ name: req.params.name })

  const result = []

  for (const i of data.guests) {
    const guest = await db.collection('users').findOne({ _id: i })

    result.push({
      name: guest.name,
      email: guest.email,
      date: guest.registrationDateTime
    })
  }

  return {
    data: result
  }
}

/**
 * Get info for profile/deposit page
 */
export async function getDeposits (req) {
  const data = await db.collection('users').findOne({ name: req.params.name })

  return {
    data: data.btc.deposits
  }
}

/**
 * Get info for profile/withdraw page
 */
export async function getWithdraws (req) {
  const data = await db.collection('users').findOne({ name: req.params.name })

  return {
    data: data.btc.withdraws,
    balance: data.balance.real
  }
}



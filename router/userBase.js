import bitcoinTransaction from 'bitcoin-transaction'
import { cipher, db, RANKING_DATA } from '../utils/globals.js'
import { generateWallet, getBtcBalance } from '../blockchain/btc.js'
import pkg from 'mongodb'
import * as bitcoin from 'bitcoinjs-lib'
import axios from 'axios'
import moment from 'moment'
import { TASK_LIST } from '../utils/globals.js'

const { ObjectId } = pkg;

/**
 * Checks if this name is unique
 *
 * @param {string} name Name provided during registration attempt
 * @throws {'name_occupied'} If the name is already taken
 */
async function isNameUnique (userId) {
  const result = await db.collection('users').findOne({ user_id: userId })
  return result === null
}

/**
 * Checks username format. The username must be between 4 and 25 characters long and must not contain the “@” character
 *
 * @param {string} name Username
 * @throws {'name_incorrect'} If the username is incorrect
 */
function validateName (name) {
  if (!(name !== undefined )) {
    throw Error('name_incorrect')
  }
}

/**
 * Read user data from the database
 *
 * @param {string} userName user_name
 * @returns {Object} User data
 */
async function readData (userId) {
  return await db.collection('users').findOne({ userId: userId })
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
 * @param {string} userName User ID
 * @param {string} session Session key
 * @throws {'name_incorrect'} If there is no user with this id
 * @throws {'session'} If the session key is invalid
 */
export async function checkSession (userName, session) {
  validateSession(session)

  const result = await db.collection('users').findOne({user_name: userId })
  if (!result) {
    throw Error('name_incorrect')
  } else if (session !== result.session) {
    throw Error('session')
  }
}



/**
 * Ends a user session. Nullifies the current session key
 *
 * @param {string} userId User id
 */
export async function endSession (userId) {
  await db.collection('users').updateOne({ user_name: userId }, { $set: { session: null } })
}

/**
 * User registration
 *
 * @param {Object} req Request object
 * @returns {Object} User info and session key
 */
export async function register (userId, userName,realName,avatarUrl,friend) {
  validateName(realName)
  const isUnique = await isNameUnique(userId)
  console.log("unique:", isUnique);
  if(isUnique){
    await db.collection('users').insertOne({
      registrationDateTime: new Date(),
      user_id: userId,
      user_name: userName,
      name: realName,
      guests: [],
      balance: {
        virtual: 10,
        real: 0
      },
      gamesHistory: {
        virtual: [],
        real: []
      },
      ranking:{
        virtual: RANKING_DATA[0],
        real: RANKING_DATA[0]
      },
      total_earning:{
        virtual: 0,
        real: 0
      },
      btc: {
        wallet: generateWallet(),
        deposits: [],
        withdraws: [],
        affilation: [],
        deposited: 0
      },
      expiration: new Date().getTime(),
        task:{
          virtual: {
            achieve_task: [],
            done_task : []
          },
          real: {
            achieve_task: [],
            done_task : []
          },
      } ,
      friend : friend,
      first_state : true,
      avatar_url : avatarUrl,
      dailyHistory : "" 
    })
  }
    
    
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

export async function taskPerform(req){
  const data = await db.collection('users').findOne({user_id : req.body.userId},{_id: 0, task: 1});
  console.log(data.task)
  return {task:data.task}
}

/**
 * Get info for profile pages
 */
export async function usersInfo (req) {
  await register(req.body.userId, req.body.userName,req.body.realName,req.body.userAvatarUrl,"No friend")
  // const data = await db.collection('users').find().project({ _id: 0, name: 1, user_name: 1, gamesHistory: 1, balance: 1, referral: 1, 'btc.wallet.publicAddress': 1, expiration: 1, ranking: 1 }).toArray()
  const data = await db.collection('users').find().project({ _id: 0, user_id: 1, name: 1, user_name: 1, gamesHistory: 1, balance: 1, referral: 1, ranking: 1,first_state: 1, avatar_url: 1 }).toArray()
  return {
    allUsersData: data.map(i => {
      // i.btc.wallet.publicAddress = cipher.decrypt(i.btc.wallet.publicAddress)
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

export async function gameHistory (req) {
  let realHistory = [{}], virtualHistory =[{}];
  let data = await db.collection('users').findOne({user_id: req.body.userId}, { _id: 0,  gamesHistory: 1, })

  realHistory = data.gamesHistory.real;
  virtualHistory = data.gamesHistory.virtual;
  if (realHistory.length > req.body.historySize) {
    realHistory = realHistory.slice(realHistory.length - req.body.historySize)
  } else realHistory = data.gamesHistory.real
  if (virtualHistory.length > req.body.historySize) {
    virtualHistory = virtualHistory.slice(virtualHistory.length - req.body.historySize)
  } else virtualHistory = data.gamesHistory.virtual
  
  return {gamesHistory:{real : realHistory, virtual : virtualHistory}}
}


export async function checkFirst (req) {
  console.log(req.body.userId)
  db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'first_state': "false"} })
}

/**
 * Get deposits and send btc to shared wallet
 */
export async function checkDeposits (req) {
  const deposits =
    (await db.collection('users').find().project({ _id: 0, 'btc.wallet.publicAddress': 1, 'btc.deposited': 1, inviter: 1, name: 1, email: 1, 'btc.wallet.privateKeyWIF': 1 }).toArray())
      .map(i => { return { address: cipher.decrypt(i.btc.wallet.publicAddress), recieved: i.btc.deposited, inviter: i.inviter, name: i.name, email: i.email, wif: cipher.decrypt(i.btc.wallet.privateKeyWIF) } })

  // const data = await getBtcBalance(deposits)
  const data =[]

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
          // console.log(res)

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
  db.collection('users').updateOne({ user_id: i.userId }, { $inc: { 'btc.deposited': amount, 'balance.real': amount } })
  db.collection('users').updateOne({ user_id: i.userId }, { $push: { 'btc.deposits': { id: generateRandomString(8), amount, date: new Date() } } })
  if (i.inviter) {
    db.collection('users').updateOne({ user_id: i.inviter }, { $inc: { 'balance.real': amount * 0.03 } })
    db.collection('users').updateOne({ user_id: i.inviter  }, { $push: { 'btc.affilation': { date: new Date(), amount: amount * 0.03, name: i.name, email: i.email } } })
  }
}

/**
 * Withdraw bitcoins from account
 */
export async function withdraw (req) {
  // await checkSession(req.cookies.user_id, req.cookies.session)
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

    db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'btc.withdraws': { date: new Date(), amount: req.body.amount, address: req.body.publicAddress } } })
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
    const guest = await db.collection('users').findOne({ user_name: i })

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

export async function taskBalance (req){
  const data = req.body;
  if(data.isReal)
   await db.collection('users').updateOne({user_id : data.userId},{$inc : {'balance.real' : parseFloat(data.amount), 'total_earning.real' : parseFloat(data.amount)}, $push : {'task.real.done_task':data.task}});
  else
   await db.collection('users').updateOne({user_id : data.userId},{$inc : {'balance.virtual' : parseFloat(data.amount), 'total_earning.virtual' : parseFloat(data.amount)}, $push : {'task.virtual.done_task':data.task}});
}
export async function addFriend (req, res){
  await register(req.body.userId, req.body.userName, req.body.realName, req.body.userAvatarUrl,"");
  
  try {
    const friend_check = await db.collection('users').findOne({ 'user_id': req.body.userId });
   console.log("friend_check",friend_check)
    if (friend_check.friend !=="") {
      return res
        .status(400)
        .json({ msg: "You are already added in friend item" });
    }else if( friend_check.user_name === req.body.friend){
      return res
        .status(400)
        .json({ msg: "You can't added myself" });
    } else{
      await db.collection('users').updateOne(
        { user_id: req.body.userId },
        { $set:{'friend' :req.body.friend }})
       if(req.body.real) 
       {
        await db.collection('users').updateOne( 
          { user_id: req.body.userId},
          { $inc: { 'balance.real': 25,'total_earning.real':25} })
        await db.collection('users').updateOne( 
          { user_id: req.body.friend},
          { $inc: { 'balance.real': 25,'total_earning.real':25} })
       }else
       {
        await db.collection('users').updateOne( 
          { user_id: req.body.userId},
          { $inc: { 'balance.virtual': 25,'total_earning.virtual':25} })
        await db.collection('users').updateOne( 
          { user_id: req.body.friend},
          { $inc: { 'balance.virtual': 25,'total_earning.virtual':25} })
       }
      
      // res.json(friend_new);

    }
  } catch (error) {
    res.status(400).json({ msg: error });
  }
};
export async function getFriend (req, res){
  try {
    const userIdString = req.body.userId.toString()
    console.log(userIdString)

    const data = await db.collection('users').find({friend:userIdString}).project({ _id: 0, name: 1,   balance: 1,  ranking: 1, avatar_url: 1 }).toArray()

    return {friendData: data}
  } catch (error) {
    res.status(400).json({ msg: error });
  } 
};

export async function getTask (req){
  try{
    const data = await db.collection('tasks').find({}).project({_id:0, src:1, title:1,amount:1}).toArray()
    console.log("data task",data)
    return {
      task:{
        display: data,
        content: TASK_LIST}
    }
  }catch(error){
    console.log(error)
  }
}
export async function updateAvatar (req) {
  try{
    const updateState = await db.collection('users').updateOne({user_id:req.body.userId},{$set : {'avatar_url':req.body.userAvatarUrl}});
    return updateState
  }catch(error){
    console.log(error)
  }
}
export async function checkDailyReward(req) {
  try{ 
    const dailyRewardDate = await db.collection('users').findOne({user_id : req.body.userId},{_id:0, dailyHistory:1})
    return {dailyRewardDate:dailyRewardDate.dailyHistory}
  }catch(error){
    console.log(error)
  }
}
export async function performDailyReward(req) {
  try{
    const currentDate = moment().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
    const performDailyReward = await db.collection('users').updateOne({user_id:req.body.userId},{$set:{'dailyHistory':currentDate},$inc:{'balance.real':10,'balance.virtual':10}})
  }catch(error){
    console.log(error)
  }
}
export function addPerformList (req){
  writeTask(req.body.userId,req.body.performTask, req.body.isReal)
}
async function writeTask(userId,performTask,isReal) {
  const data = await db.collection('users').findOne({user_id : userId},{_id: 0, task: 1});

  let combinedArray ;
  if(isReal)
    combinedArray = [...data.task.real.achieve_task, ...performTask];
  else
    combinedArray = [...data.task.virtual.achieve_task, ...performTask];

  console.log(combinedArray)

  // create a Set to track unique names
  const uniqueNames = new Set();
  const uniqueArray = combinedArray.filter((item)=>{
    if(!uniqueNames.has(item)){
      uniqueNames.add(item);
      return true
    }
    return false;
  })
  console.log(uniqueArray)
  if(isReal)
    await db.collection('users').updateOne({user_id : userId}, {$set : {'task.real.achieve_task' : uniqueArray}});
  else
    await db.collection('users').updateOne({user_id : userId}, {$set : {'task.virtual.achieve_task' : uniqueArray}});


}
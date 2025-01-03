import bitcoinTransaction from 'bitcoin-transaction'
import { cipher, db, RANKING_DATA } from '../utils/globals.js'
import { generateWallet, getBtcBalance } from '../blockchain/btc.js'
import pkg from 'mongodb'
import * as bitcoin from 'bitcoinjs-lib'
import axios from 'axios'
import moment from 'moment'
import fs from 'fs'
import { error } from 'console'
import { startGame, startGameWithoutSocket, stopGame, stopGameWithoutSocket } from '../game/index.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import fetch from 'node-fetch'

const { ObjectId } = pkg;
/**
 * Checks if this name is unique
 *
 * @param {string} name Name provided during registration attempt
 * @throws {'name_occupied'} If the name is already taken
 */
async function isNameUnique(userId) {
  const result = await db.collection('users').findOne({ user_id: userId })
  return result === null
}

/**
 * Checks username format. The username must be between 4 and 25 characters long and must not contain the “@” character
 *
 * @param {string} name Username
 * @throws {'name_incorrect'} If the username is incorrect
 */
function validateName(name) {
  if (name === undefined) {
    throw Error('name_incorrect')
  }
}

/**
 * Read user data from the database
 *
 * @param {string} userName user_name
 * @returns {Object} User data
 */
async function readData(userId) {
  return await db.collection('users').findOne({ userId: userId })
}

function generateRandomString(length) {
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
async function startSession(login) {
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
export async function checkSession(userName, session) {
  validateSession(session)

  const result = await db.collection('users').findOne({ user_id: userId })
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
export async function endSession(userId) {
  await db.collection('users').updateOne({ user_name: userId }, { $set: { session: null } })
}

/**
 * User registration
 *
 * @param {Object} req Request object
 * @returns {Object} User info and session key
 */
export async function register(userId, userName, realName, avatarUrl, friend) {
  validateName(realName)
  // console.log("unique:", isUnique);
  const isUnique = await isNameUnique(userId)
  if (isUnique) {
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
      ranking: {
        virtual: RANKING_DATA[0],
        real: RANKING_DATA[0]
      },
      total_earning: {
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
      task: {
        virtual: {
          achieve_task: [],
          done_task: []
        },
        real: {
          achieve_task: [],
          done_task: []
        },
      },
      friend: friend,
      first_state: true,
      avatar_url: avatarUrl,
      dailyHistory: "",
      dailyADS: "",
      consecutive_days: 0,
      friend_count: 0
    })
  }
}

/**
 * Write page visitor to database
 */
export function logVisitor(req) {
  db.collection('visitors').insertOne({
    ip: req.ip,
    from: req.headers.referer,
    to: req.path,
    uid: req.headers['user-agent'],
    time: new Date()
  })
}

export async function taskPerform(req) {
  const data = await db.collection('users').findOne({ user_id: req.body.userId }, { _id: 0, task: 1, balance: 1 });
  // console.log(data.task)
  return { task: data.task, balance: data.balance }
}

export async function saveAvatar(avatarImg, userId) {
  if (avatarImg) {
    try {
      const response = await axios({
        method: 'GET',
        url: avatarImg,
        responseType: 'stream'
      });
      // console.log(avatarImg)
      // console.log("response data: ",response.data)
      const savePath = "/var/avatar/" + userId.toString() + '.jpg';
      // console.log("save path : ", savePath)
      const writer = fs.createWriteStream(savePath);
      await response.data.pipe(writer);
      writer.on('finish', () => {
        // console.log("Finish all")
      })
      writer.on('error', () => {
        console.log('error this url', error)
      })
      // console.log("user String", userId.toString())
      return `https://telegramminiapp-rocket-backend-lbyg.onrender.com/avatar/${userId.toString()}.jpg`
    } catch (error) {
      console.log(error)
    }
  }
  else return null
}

/**
 * Get info for profile pages
 */
export async function userInfo(req) {
  const data = req.body;
  const isUnique = await isNameUnique(data.userId)
  console.log("isUnique", isNameUnique)
  if (isUnique) {
    const avatarUrl = await saveAvatar(data.userAvatarUrl, data.userId)
    // console.log("avatar : ", avatarUrl);
    await register(data.userId, data.userName, data.realName, avatarUrl, "No friend")
  }
  // const data = await db.collection('users').find().project({ _id: 0, name: 1, user_name: 1, gamesHistory: 1, balance: 1, referral: 1, 'btc.wallet.publicAddress': 1, expiration: 1, ranking: 1 }).toArray()
  const query = { user_id: Number(data.userId) }
  const outdata = await db.collection('users').find(query).project({ _id: 0, user_id: 1, name: 1, user_name: 1, gamesHistory: 1, balance: 1, referral: 1, ranking: 1, first_state: 1, task: 1, dailyHistory: 1, friend_count: 1 }).toArray()
  // console.log("length of fetch data:", data.length)

  // const userId = parseInt(req.body.userId); // Parse userId only once

  // Pre-processing: Create maps for faster lookups (do this once, ideally when data is loaded)
  // const usersByRealBalance = [...data].sort((a, b) => b.balance.real - a.balance.real);
  // const usersByVirtualBalance = [...data].sort((a, b) => b.balance.virtual - a.balance.virtual);
  // const userMap = new Map(data.map(user => [user.user_id, user]));


  // const userData = userMap.get(userId);

  // if (!userData) {
  //   throw new Error("User not found");
  // }

  // let friendNumber = 0;
  // const realRank = usersByRealBalance.findIndex(user => user.user_id === userId) + 1;
  // const virtualRank = usersByVirtualBalance.findIndex(user => user.user_id === userId) + 1;

  // //Count friends -  This could be optimized further if friend relationships are stored more efficiently.
  // data.forEach(user => {
  //   if (user.friend === userId) {
  //     friendNumber++;
  //   }
  // });
  return {
    userData: outdata[0],
    // friendNumber: friendNumber,
    // realRank: realRank,
    // virtualRank: virtualRank
  }
}

export async function getRanking(req) {

  const data = await db.collection('users').find().project({ _id: 0, user_id: 1, balance: 1 }).toArray()
  const userId = Number(req.body.userId); // Parse userId only once
  console.log(userId)

  // Pre-processing: Create maps for faster lookups (do this once, ideally when data is loaded)
  const usersByRealBalance = [...data].sort((a, b) => b.balance.real - a.balance.real);
  const usersByVirtualBalance = [...data].sort((a, b) => b.balance.virtual - a.balance.virtual);
  const realRank = usersByRealBalance.findIndex(user => user.user_id === userId) + 1;
  const virtualRank = usersByVirtualBalance.findIndex(user => user.user_id === userId) + 1;
  console.log(virtualRank, " sort   ", usersByVirtualBalance[virtualRank - 2], " ")
  console.log(virtualRank, " sort   ", usersByVirtualBalance[virtualRank - 1], " ")
  console.log(virtualRank, " sort   ", usersByVirtualBalance[virtualRank], " ")
  return {
    realRank: realRank,
    virtualRank: virtualRank
  }


}

export async function allUsersInfo(req) {
  const data = await db.collection('users').find().project({ _id: 0, user_id: 1, name: 1, user_name: 1, balance: 1, ranking: 1, avatar_url: 1 }).toArray()
  return { allUsersData: data }
}

export async function gameHistory(req) {
  let realHistory = [{}], virtualHistory = [{}];
  let data = await db.collection('users').findOne({ user_id: req.body.userId }, { _id: 0, gamesHistory: 1, })

  realHistory = data.gamesHistory.real;
  virtualHistory = data.gamesHistory.virtual;
  if (realHistory.length > req.body.historySize) {
    realHistory = realHistory.slice(realHistory.length - req.body.historySize)
  } else realHistory = data.gamesHistory.real
  if (virtualHistory.length > req.body.historySize) {
    virtualHistory = virtualHistory.slice(virtualHistory.length - req.body.historySize)
  } else virtualHistory = data.gamesHistory.virtual

  return { gamesHistory: { real: realHistory, virtual: virtualHistory } }
}


export async function checkFirst(req) {
  // console.log(req.body.userId)
  db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'first_state': "false" } })
}

/**
 * Get deposits and send btc to shared wallet
 */
export async function checkDeposits(req) {
  const deposits =
    (await db.collection('users').find().project({ _id: 0, 'btc.wallet.publicAddress': 1, 'btc.deposited': 1, inviter: 1, name: 1, email: 1, 'btc.wallet.privateKeyWIF': 1 }).toArray())
      .map(i => { return { address: cipher.decrypt(i.btc.wallet.publicAddress), recieved: i.btc.deposited, inviter: i.inviter, name: i.name, email: i.email, wif: cipher.decrypt(i.btc.wallet.privateKeyWIF) } })

  // const data = await getBtcBalance(deposits)
  const data = []

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
          // console.log(`statusCode: ${res.statusCode}`)
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

function writeDepositDataToDB(i) {
  const amount = parseInt(((i.total_received - i.recieved - 1500) / 100).toFixed(0))
  db.collection('users').updateOne({ user_id: i.userId }, { $inc: { 'btc.deposited': amount, 'balance.real': amount } })
  db.collection('users').updateOne({ user_id: i.userId }, { $push: { 'btc.deposits': { id: generateRandomString(8), amount, date: new Date() } } })
  if (i.inviter) {
    db.collection('users').updateOne({ user_id: i.inviter }, { $inc: { 'balance.real': amount * 0.03 } })
    db.collection('users').updateOne({ user_id: i.inviter }, { $push: { 'btc.affilation': { date: new Date(), amount: amount * 0.03, name: i.name, email: i.email } } })
  }
}

/**
 * Withdraw bitcoins from account
 */
export async function withdraw(req) {
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
export async function getIncomesFromReferrals(req) {
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
export async function getReferrals(req) {
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
export async function getDeposits(req) {
  const data = await db.collection('users').findOne({ name: req.params.name })

  return {
    data: data.btc.deposits
  }
}

/**
 * Get info for profile/withdraw page
 */
export async function getWithdraws(req) {
  const data = await db.collection('users').findOne({ name: req.params.name })

  return {
    data: data.btc.withdraws,
    balance: data.balance.real
  }
}

export async function taskBalance(req) {
  const data = req.body;

  if (data.isReal)
    await db.collection('users').updateOne({ user_id: data.userId }, { $inc: { 'balance.real': parseFloat(data.amount), 'total_earning.real': parseFloat(data.amount) }, $push: { 'task.real.done_task': data.task } });
  else
    await db.collection('users').updateOne({ user_id: data.userId }, { $inc: { 'balance.virtual': parseFloat(data.amount), 'total_earning.virtual': parseFloat(data.amount) }, $push: { 'task.virtual.done_task': data.task } });
}

export async function addFriend(req, res) {
  const friendId = Number(req.body.friend);
  const avatarUrl = await saveAvatar(req.body.userAvatarUrl, req.body.userId)
  // console.log("avatar add Friend: ", avatarUrl);
  await register(req.body.userId, req.body.userName, req.body.realName, avatarUrl, "");

  try {
    const friend_check = await db.collection('users').findOne({ 'user_id': req.body.userId });
    //  console.log("friend_check",friend_check)
    if (friend_check.friend !== "") {
      return "You are already added in friend item";
    } else if (friend_check.user_name === friendId) {
      return "You can't added myself";
    } else {
      await db.collection('users').updateOne(
        { user_id: req.body.userId },
        { $set: { 'friend': friendId } })
      await db.collection('users').updateOne(
        { user_id: friendId },
        { $inc: { 'friend_count': 1 } })
      if (req.body.real) {
        await db.collection('users').updateOne(
          { user_id: req.body.userId },
          { $inc: { 'balance.real': 25, 'total_earning.real': 25 } })
        await db.collection('users').updateOne(
          { user_id: friendId },
          { $inc: { 'balance.real': 25, 'total_earning.real': 25, } })
      } else {
        await db.collection('users').updateOne(
          { user_id: req.body.userId },
          { $inc: { 'balance.virtual': 25, 'total_earning.virtual': 25 } })
        await db.collection('users').updateOne(
          { user_id: friendId },
          { $inc: { 'balance.virtual': 25, 'total_earning.virtual': 25 } })
      }

      // res.json(friend_new);

    }
  } catch (error) {
    console.log("error: ", error)
  }
};

export async function getFriend(req, res) {
  try {
    const userIdString = req.body.userId.toString()
    // console.log(userIdString)

    const data = await db.collection('users').find().project({ _id: 0, name: 1, balance: 1, ranking: 1, avatar_url: 1, friend: 1 }).toArray()

    return { friendData: data }
  } catch (error) {
    res.status(400).json({ msg: error });
  }
};

export async function getTask(req) {
  try {
    const data = await db.collection('task_list').find().toArray()
    // console.log("data task",data)
    const outData = data.map((_data) => {
      if (_data.index === 31) return { ..._data, link_url: _data.link_url + req.body.userId }
      else return _data
    })
    // console.log("outdata task",outData)
    return {
      task: outData
    }
  } catch (error) {
    console.log(error)
  }
}

// export async function getStateTaskUfo(req) {
//   try {
//     const data = req.body;
//     writeTask(data.userId, [31], data.isReal)
//   } catch (e) {
//     console.log(e)
//   }
// }

export async function updateAvatar(req) {
  try {
    const avatarUrl = await saveAvatar(req.body.userAvatarUrl, req.body.userId)
    // console.log("avatar updateAvatar : ", avatarUrl);
    const updateState = await db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'avatar_url': avatarUrl } });
    return updateState
  } catch (error) {
    console.log(error)
  }
}

export async function checkDailyReward(req) {
  try {
    const dailyInfo = await db.collection('users').findOne({ user_id: req.body.userId }, { _id: 0, dailyHistory: 1, consecutive_days: 1, dailyADS: 1 })
    console.log("dailyInfo : ", dailyInfo)
    const dailyADS = dailyInfo.dailyADS ? dailyInfo.dailyADS : ""
    return { dailyRewardInfo: { date: dailyInfo.dailyHistory, consecutive_days: dailyInfo.consecutive_days }, dailyADSInfo: { date: dailyADS } }
  } catch (error) {
    console.log(error)
  }
}

export async function performDailyReward(req) {
  try {
    const currentDate = moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
    if (req.body.task != 38) {
      req.body.isReal ?
        await db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'dailyHistory': currentDate, 'consecutive_days': req.body.consecutiveDays }, $inc: { 'balance.real': parseFloat(req.body.amount) } })
        : await db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'dailyHistory': currentDate, 'consecutive_days': req.body.consecutiveDays }, $inc: { 'balance.virtual': parseFloat(req.body.amount) } })
    } else {
      req.body.isReal ?
        await db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'dailyADS': currentDate }, $inc: { 'balance.real': parseFloat(req.body.amount)}, $push: { 'task.real.done_task': req.body.task }})
        : await db.collection('users').updateOne({ user_id: req.body.userId }, { $set: { 'dailyADS': currentDate }, $inc: { 'balance.virtual': parseFloat(req.body.amount)}, $push: { 'task.virtual.done_task': req.body.task }})
    }
  } catch (error) {
    console.log(error)
  }
}

export async function performDailyADS(req) {
  // console.log("perform daily reward", req.body)
  try {
    // console.log("performDailyReward ",req.body)

    const currentDate = moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
    const performDailyReward = req.body.isReal
      ? await db.collection('users').updateOne({ user_id: req.body.userId }, { $inc: { 'balance.real': parseFloat(req.body.amount) }, $pull: { 'task.real.achieve_task': req.body.task }})
      : await db.collection('users').updateOne({ user_id: req.body.userId }, { $inc: { 'balance.virtual': parseFloat(req.body.amount) }, $pull: { 'task.virtual.achieve_task': req.body.task }})
    // console.log("performDailyReward",performDailyReward)
  } catch (error) {
    console.log(error)
  }
}

export function addPerformList(req) {
  const data = req.body;
  // console.log("add perform task : ", data)
  writeTask(data.userId, data.performTask, data.isReal)
}

export async function writeTask(userId, performTask, isReal) {
  try {
    const data = await db.collection('users').findOne({ user_id: userId }, { _id: 0, task: 1 });

    if (data) {
      let combinedArray;
      let performList;
      if (isReal) {
        combinedArray = [...data.task.real.achieve_task, ...performTask];
        performList = data.task.real.done_task.filter(item => !performTask.includes(item));
      }
      else {
        combinedArray = [...data.task.virtual.achieve_task, ...performTask];
        console.log(performTask);
        performList = data.task.virtual.done_task.filter(item => !performTask.includes(item));
      }

      console.log(performList);
      
      // create a Set to track unique names
      const uniqueNames = new Set();
      const uniqueArray = combinedArray.filter((item) => {
        if (!uniqueNames.has(item)) {
          uniqueNames.add(item);
          return true
        }
        return false;
      })
      // console.log(uniqueArray)
      if (isReal)
        await db.collection('users').updateOne({ user_id: userId }, { $set: { 'task.real.achieve_task': uniqueArray, 'task.real.done_task': performList } });
      else
        await db.collection('users').updateOne({ user_id: userId }, { $set: { 'task.virtual.achieve_task': uniqueArray, 'task.virtual.done_task': performList } });
    }
  } catch (e) {
    console.log(e)
  }
}

export async function chargeBalance(req) {
  const inputData = req.body;
  // console.log(" charge balance user id", inputData.userId)
  // console.log(" charge balance amount:", inputData.amount)
  await db.collection('users').updateOne(
    { user_id: inputData.userId },
    { $inc: { 'balance.virtual': parseFloat((inputData.amount).toFixed(2)) } })
}

export async function checkBalance(userId, bet, isReal) {
  let balance = (await db.collection('users').findOne({ user_id: userId }, { _id: 0, balance: 1 })).balance
  return isReal ? balance.real : balance.virtual;
}

export async function allUserId() {
  const data = await db.collection('users').find().project({ _id: 0, user_id: 1 }).toArray()
  return data;
}

export async function gameHandler(req) {
  try {
    const inputData = req.body;
    if (!inputData.userId) {
      return {
        status: "error",
        data: {
          msg: "no user info"
        }
      }
    }

    const userBalance = await checkBalance(inputData.userId, inputData.bet, inputData.isReal);
    if (inputData.operation == "start") {
      if (userBalance <= 0) {
        return {
          status: "error",
          data: {
            msg: "no such balance"
          }
        }
      }

      if (inputData.bet > userBalance) {
        inputData.bet = userBalance;
      }

      if (inputData.bet < 1) {
        return {
          status: "error",
          data: {
            msg: "small bet"
          }
        }
      }
    }

    if (inputData.operation == "start") {
      const result = startGameWithoutSocket(inputData)
      if (!result) {
        return {
          status: "success",
          data: {
            gameLimit: result,
            operation: "started"
          }
        }
      } else {
        return {
          status: "success",
          data: {
            gameLimit: result,
            operation: "started"
          }
        }
      }
    } else if (inputData.operation == "stop") {
      const result = stopGameWithoutSocket(inputData);
      return {
        status: "success",
        data: {
          result,
          isSuccess: inputData.isSuccess
        }
      }
    }
  } catch (error) {
    console.log(error);
    return {
      status: "error",
      data: {
        msg: "Unexpected Error"
      }
    }
  }
}


export async function loginAdmin(req) {
  const data = req.body;
  // console.log("login admin",data)

  const user = await db.collection('admins').findOne({ user_name: data.userName });
  // console.log("user", user)
  if (!user) {
    return { err: 'User not found.' };
  }
  if (!await bcrypt.compare(data.password, user.password)) {
    return { err: 'Invalid password.' };
  }
  return { err: null }

}

export async function registerAdmin(req) {
  const data = req.body;
  const hashPassword = await bcrypt.hash(data.password, 10)
  await db.collection('admins').insertOne(
    {
      user_name: data.userName,
      password: hashPassword
    }
  )
  return { err: null }
}
export async function InsertTask(req) {
  const data = req.body;
  // console.log("input data : ", req.body);
  const icon_url = await saveIcon(data.fileUrl, data.type);
  // console.log(icon_url)
  await db.collection('task_list').insertOne(
    {
      title: data.title,
      amount: Number(data.amount),
      type: data.type,
      count: Number(data.count),
      index: Number(data.index),
      sort: Number(data.sort),
      link_url: data.url,
      fixed: Number(data.fixed),
      icon_url: icon_url,
      filter: Number(data.filter),
      highLight: Number(data.highLight)
    }
  )

}
export async function editTask(req) {
  const data = req.body;
  // console.log("input data : ", req.body);
  const icon_url = await saveIcon(data.fileUrl, data.type);
  console.log(icon_url)
  await db.collection('task_list').updateOne(
    { _id: new ObjectId(data.key) },
    {
      $set: {
        title: data.title,
        amount: Number(data.amount),
        type: data.type,
        count: Number(data.count),
        index: Number(data.index),
        sort: Number(data.sort),
        link_url: data.url,
        fixed: Number(data.fixed),
        filter: Number(data.filter),
        highLight: Number(data.highLight),
        ...(icon_url && { icon_url: icon_url }),
      }
    }
  );
}



export async function deleteTask(req) {
  const data = req.body;
  const icon_url = await saveIcon(data.fileUrl, data.type);
  const savePath = "/var/avatar/icon/" + data.type.toString() + '.jpg';
  fs.unlink(savePath, (err) => {
    if (err) {
      console.log("delete file", err)
      return
    }
  })

  await db.collection('task_list').deleteOne(
    { _id: new ObjectId(data.key) });

}
export async function getAdminTasks(req) {
  const data = await db.collection('task_list').find().toArray();
  return { tasks: data };
}

export async function payTelegramStar(req, res) {
  const data = req.body;
  if (data.amount < 0) {
    throw "not valid amount";
  }
  try {
    const result = await createInvoice(data.userId, data.amount, data.isReal, "coin", "Do you want to buy 10 coin for 1 star?");
    return { invoiceUrl: result }
  } catch (error) {
    console.log(error);
    throw "internal server error";
  }
}

async function saveIcon(imageUrl, type) {
  // console.log("image url : ", imageUrl)
  if (imageUrl) {
    try {
      const decodedData = atob(imageUrl.split(',')[1]);
      const buffer = Buffer.from(decodedData, 'binary');

      const savePath = "/var/avatar/icon/" + type.toString() + '.jpg';
      // console.log(savePath)
      // console.log("buffer : ", buffer)
      fs.writeFileSync(savePath, buffer);

      return `https://telegramminiapp-rocket-backend-lbyg.onrender.com/icon/${type.toString()}.jpg`
    } catch (error) {
      console.log(error)
    }
  }
  else return null
}

async function createInvoice(userId, amount, is_real, title, description) {
  const result = await db.collection('payment').insertOne(
    {
      telegram_id: userId,
      amount: amount * 10,
      is_real: is_real,
      type: title,
      description: description,
      status: "pending"
    }
  )
  const invoiceId = result.insertedId;
  const payload = `${userId}_${invoiceId}`;
  const data = {
    "title": `${amount * 10} RocketTON ${title}s`,
    "description": description,
    "payload": payload,
    "currency": "XTR",
    "prices": [{ "label": `Rocket Ton Coins`, "amount": Number(amount) }]
  }

  const headers = new Headers()
  headers.append('Content-Type', 'application/json')
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`;
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers
  })
  const res = await response.json();
  console.log(res);
  return res.result;
}
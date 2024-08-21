import { ACCELERATION, db, MAX_WIN } from '../utils/globals.js'
import pkg from 'mongodb'

let timeout
const { ObjectId } = pkg
function writeStatistics (isReal, userID, historyData) {
  if (userID) {
    if (isReal) {
      db.collection('users').updateOne(
        { _id: new ObjectId(userID) },
        { $push: { 'gamesHistory.real': historyData }, $inc: { 'balance.real': parseFloat(historyData.profit) } })
    } else {
      db.collection('users').updateOne(
        { _id: new ObjectId(userID) },
        { $push: { 'gamesHistory.virtual': historyData }, $inc: { 'balance.virtual': parseFloat(historyData.profit) } })
    }
  }
}

function nonNullRandom () {
  return Math.random() || nonNullRandom()
}

export function startGame (connection, data, setStopFlag) {
  let result = (1 / nonNullRandom()).toFixed(2)
  if (data.isReal) {
    result = (1 + (result - 1) * 0.95).toFixed(2)
  }
  result = result > MAX_WIN ? MAX_WIN : result

  connection.sendUTF(JSON.stringify({ operation: 'started' }))

  const autoStop = parseFloat(data.autoStop)
  console.log(result," ",autoStop)

  if (result < autoStop) {
    const time = Math.sqrt((result - 1) / ACCELERATION * 2).toFixed(0)
    timeout = setTimeout(() => {
      setStopFlag()
      const historyData = {
        crash: result,
        bet: data.bet,
        stop: 'x',
        profit: -data.bet
      }
      connection.sendUTF(JSON.stringify({ operation: 'crashed', ...historyData }))
      writeStatistics(data.isReal, data.userID, historyData)
    }, time)
  } else {
    const time = Math.sqrt((autoStop - 1) / ACCELERATION * 2).toFixed(0)
    timeout = setTimeout(() => {
      setStopFlag()
      const historyData = {
        crash: 'x',
        bet: data.bet,
        stop: autoStop,
        profit: (data.bet * (autoStop - 1)).toFixed(2)
      }
      connection.sendUTF(JSON.stringify({ operation: 'stopped', ...historyData }))
      writeStatistics(data.isReal, data.userID, historyData)
    }, time)
  }

  return Date.now()
}

export function stopGame (connection, startTime, bet, isReal, userID) {
  clearTimeout(timeout)
  const time = Date.now() - startTime
  const result = ACCELERATION * time * time / 2
  const historyData = {
    crash: 'x',
    bet,
    stop: (result + 1).toFixed(2),
    profit: (bet * result).toFixed(2)
  }
  connection.sendUTF(JSON.stringify({ operation: 'stopped', ...historyData }))
  writeStatistics(isReal, userID, historyData)
}

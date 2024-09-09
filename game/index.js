import { ACCELERATION, db, MAX_WIN, RANKING_DATA, TASK_LIST, TASK_TYPE } from '../utils/globals.js'
import moment from 'moment'
import pkg from 'mongodb'


let timeout
const { ObjectId } = pkg

const formatedDate =()=>{ 
  const currentDate = moment.utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
  // console.log(currentDate)
  return currentDate
} ;


async function writeStatistics (isReal, userId, historyData) {
  if (userId) {
    if (isReal) {
      const totalEarningInfo = await db.collection('users').findOne({user_id:userId},{_id : 0, total_earning:1})  ;
      // console.log("total_earnning  ",totalEarningInfo.total_earning.real);
      const totalEarning = parseFloat(totalEarningInfo.total_earning.real) + parseFloat(historyData.profit>0 ?parseFloat(historyData.profit):0);
      // console.log("total_earning",totalEarning)
      let rankingIndex = 0;
      if(totalEarning<100) rankingIndex = 0;
      if(totalEarning>=100 && totalEarning < 500) rankingIndex = 1;
      if(totalEarning>=500 && totalEarning < 1000) rankingIndex = 2;
      if(totalEarning>=1000 && totalEarning < 5000) rankingIndex = 3;
      if(totalEarning>=5000 && totalEarning < 10000) rankingIndex = 4;
      if(totalEarning>=10000 && totalEarning < 50000) rankingIndex = 5;
      if(totalEarning>=50000 && totalEarning < 100000) rankingIndex = 6;
      if(totalEarning>=100000 && totalEarning < 500000) rankingIndex = 7;
      if(totalEarning>=500000 && totalEarning < 1000000) rankingIndex = 8;
      if(totalEarning>=1000000) rankingIndex = 9;
     await db.collection('users').updateOne(
        { user_id: userId },
        { $push: { 'gamesHistory.real': historyData }, 
        $set: {'total_earning.real' : parseFloat(totalEarning.toFixed(2)), 'ranking.real' :RANKING_DATA[rankingIndex] } })
    } else {
      // console.log("db: ",historyData)
      const totalEarningInfo = await db.collection('users').findOne({user_id:userId},{_id : 0, total_earning:1})  ;
      // console.log("total_earnning  ",totalEarningInfo.total_earning.virtual);
      const totalEarning = parseFloat(totalEarningInfo.total_earning.virtual) + parseFloat(historyData.profit>0 ?parseFloat(historyData.profit).toFixed(2):0);
      // console.log("total_earning",totalEarning)
      let rankingIndex = 0;
      if(totalEarning<100) rankingIndex = 0;
      if(totalEarning>=100 && totalEarning < 500) rankingIndex = 1;
      if(totalEarning>=500 && totalEarning < 1000) rankingIndex = 2;
      if(totalEarning>=1000 && totalEarning < 5000) rankingIndex = 3;
      if(totalEarning>=5000 && totalEarning < 10000) rankingIndex = 4;
      if(totalEarning>=10000 && totalEarning < 50000) rankingIndex = 5;
      if(totalEarning>=50000 && totalEarning < 100000) rankingIndex = 6;
      if(totalEarning>=100000 && totalEarning < 500000) rankingIndex = 7;
      if(totalEarning>=500000 && totalEarning < 1000000) rankingIndex = 8;
      if(totalEarning>=1000000) rankingIndex = 9;
     await db.collection('users').updateOne(
        { user_id: userId },
        { $push: { 'gamesHistory.virtual': historyData },
        $set: {'total_earning.virtual' : parseFloat(totalEarning.toFixed(2)), 'ranking.virtual' :RANKING_DATA[rankingIndex] } })
    }
  }
}

function nonNullRandom () {
  return Math.random() || nonNullRandom()
}

async function updateBalance(userId, amount, isReal){
  // console.log("user Id",userId)
  // console.log("amount", amount)
  // console.log("isReal ",isReal)
  if(isReal){
    await db.collection('users').updateOne(
      { user_id: userId },
      { $inc: { 'balance.real': parseFloat((amount).toFixed(2))}})
  }else{
   await db.collection('users').updateOne(
      { user_id: userId },
      { $inc: { 'balance.virtual': parseFloat((amount).toFixed(2))}})
  }
}

export  function startGame (connection, data, setStopFlag, isReal) {
  // console.log(data)
  let result = (1 / nonNullRandom()).toFixed(2)
  if (isReal) {
    result = parseFloat(1+(result-1)*0.9).toFixed(2)
  }
  result = result > MAX_WIN ? MAX_WIN : result

  connection.sendUTF(JSON.stringify({ operation: 'started' }))

  updateBalance(data.userId,-1 * data.bet, isReal);
  


  const autoStop = parseFloat(data.autoStop)
  console.log(result," ",autoStop)

  if (result < autoStop) {
    const time = parseFloat(Math.sqrt((result-1) / ACCELERATION * 2).toFixed(2))
    timeout = setTimeout(() => {
      setStopFlag();
      const historyData = {
        date: formatedDate(),
        crash: result,
        bet: data.bet,
        stop: 'x',
        profit: parseFloat((-1*data.bet).toFixed(2))
      }
      connection.sendUTF(JSON.stringify({ operation: 'crashed', ...historyData }))
      writeStatistics(isReal, data.userId, historyData)
    }, time)
    
  } else {
    const time = parseFloat(Math.sqrt((autoStop-1) / ACCELERATION * 2).toFixed(0))
    timeout = setTimeout(() => {
      
      setStopFlag()
      
      const historyData = {
        date: formatedDate(),
        crash: 'x',
        bet: data.bet,
        stop: autoStop,
        profit: parseFloat((data.bet * autoStop).toFixed(2))
      }
      // console.log("success : bet",data.bet,"auto stop",autoStop, "profit",historyData.profit)
      connection.sendUTF(JSON.stringify({ operation: 'stopped', ...historyData }))
      updateBalance(data.userId,historyData.profit, isReal);
      writeStatistics(isReal, data.userId, historyData)  
    }, time)
      
  }
  
  return Date.now()
}

export function stopGame (connection, startTime, bet, isReal, userId) {
  // console.log("11111")
  clearTimeout(timeout)
  // console.log("22222")
  const time = Date.now() - startTime
  const result = ACCELERATION * time * time / 2
  const historyData = {
    date: formatedDate(),
    crash: 'x',
    bet,
    stop: (result + 1).toFixed(2),
    profit: parseFloat((bet * (result+1)).toFixed(2))
  }
  // console.log("------------bet---------",startTime )
  connection.sendUTF(JSON.stringify({ operation: 'stopped', ...historyData }))
  // console.log("wwwwwww")
  updateBalance(userId,historyData.profit, isReal);
  // console.log("wwwwwww")
  writeStatistics(isReal, userId, historyData)
  // console.log(historyData.profit)
}

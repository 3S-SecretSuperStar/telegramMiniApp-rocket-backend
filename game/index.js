import { ACCELERATION, db, MAX_WIN, RANKING_DATA, TASK_LIST, TASK_TYPE } from '../utils/globals.js'
import moment from 'moment'
import pkg from 'mongodb'


let timeout
const { ObjectId } = pkg
let performTask=[]

const formatedDate =()=>{ 
  const currentDate = moment.utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
  console.log(currentDate)
  return currentDate
} ;

let continueCounter  = 0;

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

async function writeStatistics (isReal, userId, historyData) {
  if (userId) {
    if (isReal) {
      const totalEarningInfo = await db.collection('users').findOne({user_id:userId},{_id : 0, total_earning:1})  ;
      console.log("total_earnning  ",totalEarningInfo.total_earning.real);
      const totalEarning = parseFloat(totalEarningInfo.total_earning.real) + parseFloat(historyData.profit>0 ?parseFloat(historyData.profit):0);
      console.log("total_earning",totalEarning)
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
      db.collection('users').updateOne(
        { user_id: userId },
        { $push: { 'gamesHistory.real': historyData }, $inc: { 'balance.real': parseFloat(historyData.profit)}, 
        $set: {'total_earning.real' : parseFloat(totalEarning.toFixed(2)), 'ranking.real' :RANKING_DATA[rankingIndex] } })
    } else {
      const totalEarningInfo = await db.collection('users').findOne({user_id:userId},{_id : 0, total_earning:1})  ;
      console.log("total_earnning  ",totalEarningInfo.total_earning.virtual);
      const totalEarning = parseFloat(totalEarningInfo.total_earning.virtual) + parseFloat(historyData.profit>0 ?parseFloat(historyData.profit).toFixed(2):0);
      console.log("total_earning",totalEarning)
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
      db.collection('users').updateOne(
        { user_id: userId },
        { $push: { 'gamesHistory.virtual': historyData }, $inc: { 'balance.virtual': parseFloat(historyData.profit)}, 
        $set: {'total_earning.virtual' : parseFloat(totalEarning.toFixed(2)), 'ranking.virtual' :RANKING_DATA[rankingIndex] } })
    }
  }
}

function nonNullRandom () {
  return Math.random() || nonNullRandom()
}

export  function startGame (connection, data, setStopFlag, isReal) {
  console.log(data)
  let result = (1 / nonNullRandom()).toFixed(2)
  performTask = []
  if (isReal) {
    result = parseFloat(1+(result-1)*0.9).toFixed(2)
  }
  result = result > MAX_WIN ? MAX_WIN : result

  connection.sendUTF(JSON.stringify({ operation: 'started' }))

  const autoStop = parseFloat(data.autoStop)
  console.log(result," ",autoStop)

  if (result < autoStop) {
    const time = parseFloat(Math.sqrt((result-1) / ACCELERATION * 2).toFixed(2))
    continueCounter = 0;
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
    continueCounter += 1;
    timeout = setTimeout(() => {
      
      setStopFlag()
      
      const historyData = {
        date: formatedDate(),
        crash: 'x',
        bet: data.bet,
        stop: autoStop,
        profit: parseFloat((data.bet * (autoStop - 1)).toFixed(2))
      }
      performTask = []
      if(continueCounter>5) continueCounter=1;
      console.log("continue Counter: full success: ",continueCounter)
      performTask = TASK_LIST.reduce((performList, task,index)=>{

      if(autoStop>=task.limit && task.method === TASK_TYPE[0]) 
        performList.push(index+1);
      if(task.method === TASK_TYPE[1] && task.limit === continueCounter) 
        performList.push(index+1);

      return performList
      },[])
      connection.sendUTF(JSON.stringify({ operation: 'stopped', ...historyData }))
      writeStatistics(isReal, data.userId, historyData)
      writeTask(data.userId, performTask, data.isReal)
      
    }, time)
      
  }
  
  return Date.now()
}

export function stopGame (connection, startTime, bet, isReal, userId) {
  console.log("11111")
  continueCounter += 1;
  clearTimeout(timeout)
  console.log("22222")
  const time = Date.now() - startTime
  const result = ACCELERATION * time * time / 2
  const historyData = {
    date: formatedDate(),
    crash: 'x',
    bet,
    stop: (result + 1).toFixed(2),
    profit: parseFloat((bet * result).toFixed(2))
  }
  console.log("33333")
  if(continueCounter>5) continueCounter=1;
  console.log("4444")
  performTask = []
  console.log("continue Counter: not-full success: ",continueCounter)
      performTask = TASK_LIST.reduce((performList, task,index)=>{
        console.log("455")
      // if(autoStop>=task.limit && task.method === TASK_TYPE[0]) 
      //   performList.push(index+1);
      console.log("4666")
      if(task.method === TASK_TYPE[1] && task.limit === continueCounter) 
        performList.push(index+1);
      console.log("4777")
      return performList
      },[])
  console.log("------------bet---------",startTime )
  connection.sendUTF(JSON.stringify({ operation: 'stopped', ...historyData }))
  writeStatistics(isReal, userId, historyData)
  writeTask(userId, performTask, isReal)
}

import express from 'express';
import * as userBase from './userBase.js';
import multer from 'multer';
import fs, { mkdir } from 'fs';
import axios from 'axios';

// import '@babel/polyfill' // async/await compilation bug

/**
 * All site routes
 */
const router = express.Router()

router.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

/**
 * Generate api routes
 */
function routeFunc(controller) {
  return async (req, res) => {
    try {
      const result = await controller(req)
      res.status(200).send(result === undefined ? {} : result) // res.json() bug fix
    } catch (e) {
      console.log(e.message)
      res.status(500).send({ error: e.message })
    }
  }
}

const postRequests = [
  ['login', userBase.login],
  ['logout', userBase.logout],
  ['recovery', userBase.recovery],
  ['change_password', userBase.changePassword],
  ['change_email', userBase.changeEmail],
  ['support', userBase.support],
  ['user_info', userBase.userInfo],
  ['resend_letter', userBase.resendConfirmationLetter],
  ['game_history', userBase.gameHistory],
  ['task_perform', userBase.taskPerform],
  ['task_balance', userBase.taskBalance],
  ['add_friend', userBase.addFriend],
  ['get_friend', userBase.getFriend],
  ['check_first', userBase.checkFirst],
  ['get_task', userBase.getTask],
  ['update_avatar', userBase.updateAvatar],
  ['check_dailyReward', userBase.checkDailyReward],
  ['perform_dailyReward', userBase.performDailyReward],
  ['perform_dailyADS', userBase.performDailyADS],
  ['add_perform_list', userBase.addPerformList],
  ['all_users_info', userBase.allUsersInfo],
  ['charge_balance', userBase.chargeBalance],
  ['all_users_id', userBase.allUserId],
  ['operate_game', userBase.gameHandler],
  ['insert_task', userBase.InsertTask],
  ['edit_task', userBase.editTask],
  ['delete_task', userBase.deleteTask],
  ['login_admin', userBase.loginAdmin],
  ['register_admin', userBase.registerAdmin],
  ['get_admin_tasks', userBase.getAdminTasks],
  ['get_ranking', userBase.getRanking],
  ['pay_telegramstar', userBase.payTelegramStar]
]

postRequests.forEach(([path, controller]) => {
  router.post(`/${path}`, routeFunc(controller))
})

/**
 * Generate page routes
 *
 * @param {string} address Relative path
 * @param {Function} method A function that returns the initial data for rendering the start page
 * @param {string} title Page title
 * @param {string} description Page description
 * @param {string} keywords Page keywords
 */

function addRoute(address, method, title, description, keywords) {
  router.get(`/${address}`, async (req, res) => {
    res.render(
      'template', {
      app,
      title,
      keywords,
      description
    }
    )
    userBase.logVisitor(req)
  })
}

router.get('/incomes_from_referrals/:name', async (req, res) => {
  const result = await userBase.getIncomesFromReferrals(req)
  res.status(200).send(result === undefined ? {} : result)
})

router.get('/guests/:name', async (req, res) => {
  const result = await userBase.getReferrals(req)
  res.status(200).send(result === undefined ? {} : result)
})

router.get('/deposits/:name', async (req, res) => {
  const result = await userBase.getDeposits(req)
  res.status(200).send(result === undefined ? {} : result)
})

router.get('/withdraws/:name', async (req, res) => {
  const result = await userBase.getWithdraws(req)
  res.status(200).send(result === undefined ? {} : result)
})

router.get('/confirmation', async (req, res) => {
  userBase.confirmAccount(req, res)
})
router.get('/api/rocketTON/verify-task-ufo', async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const checkUrl = `https://api.ufo.fun/tasks/verify-mint?referrer=0xa01641dF0bFEFb42cb739B550Fd0B4C477983201&subId=${userId}`;
    console.log("check url", checkUrl);

    await axios.get(checkUrl)
      .then(async (response) => {
        console.log(response.data);
        console.log("body : ", response.data);
        if (response.data.type === "success") {
          console.log("success")
          await userBase.writeTask(userId, [31], false);
          res.status(200).send(`${userId} success!`)
        }
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
      });
    
  } catch (e) {
    console.log(e)
  }
})



export default router

import cookieParser from 'cookie-parser'
import express from 'express'
import logger from 'morgan'
import path from 'path'
import router from '../router/index.js'
import { fileURLToPath } from 'url';
import cors from 'cors'
var app = express()
app.use(cors())
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// view engine setup
app.set('views', path.join(__dirname, './view'))
app.set('view engine', 'pug')

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, './public')))
app.use('/profile', express.static(path.join(__dirname, './public')))

app.use('/', router)
app.use('/avatar',express.static('/var/avatar'))
app.use('/icon',express.static('/var/avatar/icon'))

// catch 404 and forward to error handler
app.use(function (req, res) {
  res.redirect('/')
})

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

export default app

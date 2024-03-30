const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const path = require('path')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initilizeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB error: ${error.message}`)
  }
}

initilizeDbAndServer()

//authentication

const authentication = (request, response, next) => {
  let jwtToken
  const authHearder = request.headers['authorization']
  if (authHearder !== undefined) {
    jwtToken = authHearder.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SCRECT_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//Register API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const registerPerson = `
  SELECT
   *
  FROM
   user
  WHERE
   username = '${username}'; `
  const checkTheUser = await db.get(registerPerson)
  console.log(checkTheUser)

  if (checkTheUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const addUserQuery = `
      INSERT INTO
       user(username,password,name,gender)
      VALUES
        ('${username}',
        '${hashedPassword}',
        '${name}',
        '${gender}') 
      ;`
      const addUser = await db.run(addUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//Login API

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  userLoginQuery = `
  SELECT
   *
  FROM
   user
  WHERE
   username = '${username}';`
  const dbUser = await db.get(userLoginQuery)
  console.log(dbUser)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isMatchedPassword = await bcrypt.compare(password, dbUser.password)
    if (isMatchedPassword === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SCRECT_KEY')
      console.log(jwtToken)
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API 3

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const getTheLogedinUser = `
  SELECT
   user_id
  FROM
   user
  WHERE
   username = '${username}';`
  const userId = await db.get(getTheLogedinUser)

  const tweetQuery = `
  SELECT
   user.username,tweet.tweet, tweet.date_time AS dateTime
  FROM
   follower
   INNER JOIN tweet ON follower.following_user_id = tweet.user_id
   INNER JOIN user ON tweet.user_id = user.user_id
  WHERE
   follower.follower_user_id = ${userId.user_id}
  ORDER BY
   tweet.date_time DESC
  LIMIT 4
  OFFSET 0;`
  const latestTweet = await db.all(tweetQuery)
  response.send(latestTweet)
})

// API 4

app.get('/user/following/', authentication, async (request, response) => {
  const {username} = request
  const getTheUserId = `
  SELECT
   user_id
  FROM
   user
  WHERE
   username = '${username}'; `
  const userId = await db.get(getTheUserId)

  const getTheFolloweingUserName = `
  SELECT
   user.name
  FROM
   user INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE
   follower.follower_user_id = ${userId.user_id};`
  const getFollwer = await db.all(getTheFolloweingUserName)
  response.send(getFollwer)
})

// API 5 how follw the users

app.get('/user/followers/', authentication, async (request, response) => {
  const {username} = request
  const getTheUserId = `
  SELECT
   user_id
  FROM
   user
  WHERE
   username = '${username}'; `
  const userId = await db.get(getTheUserId)

  const getTheFolloweingUserName = `
  SELECT
   user.name
  FROM
   user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE
   follower.following_user_id = ${userId.user_id};`
  const getFollwer = await db.all(getTheFolloweingUserName)
  response.send(getFollwer)
})

//API6

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getTheUserId = `
  SELECT
   user_id
  FROM
   user
  WHERE
   username = '${username}'; `
  const userId = await db.get(getTheUserId)

  const getFollowerTweet = `
    SELECT 
      tweet.tweet AS tweet,
      (SELECT COUNT(*) FROM like WHERE tweet_id = ${tweetId}) AS likes,
      (SELECT COUNT(*) FROM reply WHERE tweet_id = ${tweetId}) AS replies,
      tweet.date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id = ${tweetId}
    AND tweet.user_id IN (
        SELECT following_user_id 
        FROM follower 
        WHERE follower_user_id = ${userId.user_id}
    );`
  const result = await db.all(getFollowerTweet)
  if (result.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(result)
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getTheUserId = `
  SELECT
   user_id
  FROM
   user
  WHERE
   username = '${username}'; `
    const userId = await db.get(getTheUserId)

    const getLikeUserName = `
  SELECT DISTINCT user.username AS likes
  FROM user
  INNER JOIN like ON user.user_id = like.user_id
  INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE like.tweet_id = ${tweetId}
  AND follower.follower_user_id = ${userId.user_id};`

    const result = await db.all(getLikeUserName)
    if (result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send(result)
    }
  },
)

//API 8

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getTheUserId = `
  SELECT
   user_id
  FROM
   user
  WHERE
   username = '${username}'; `
    const userId = await db.get(getTheUserId)

    const getReplayUserList = `
    SELECT user.name AS name, reply.reply AS reply
    FROM user
    INNER JOIN follower ON user.user_id = follower.following_user_id
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE follower.follower_user_id = ${userId.user_id}
    AND tweet.tweet_id = ${tweetId};`

    const result = await db.all(getReplayUserList)

    if (result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send(result)
    }
  },
)

//API 9

app.get('/user/tweets/', authentication, async (request, response) => {
  const {username} = request
  const getTheUserId = `
   SELECT
    user_id
  FROM
   user
  WHERE
   username = '${username}'; `
  const userId = await db.get(getTheUserId)

  const getTheTweetOfUser = `
  SELECT
    tweet.tweet,
    COUNT(like.like_id) AS likes,
    COUNT(reply.reply_id) AS replies,
    tweet.date_time AS dateTime
  FROM
    tweet
    INNER JOIN
    like ON tweet.tweet_id = like.tweet_id
    INNER JOIN
    reply ON tweet.tweet_id = reply.tweet_id
  WHERE
      tweet.user_id = ${userId.user_id};`
  const result = await db.all(getTheTweetOfUser)
  response.send(result)
})

//API 10 create the tweet

app.post('/user/tweets/', authentication, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const getTheUserId = `
   SELECT
    user_id
  FROM
   user
  WHERE
   username = '${username}'; `
  const userId = await db.get(getTheUserId)

  const createTheTweet = `
  INSERT INTO
   tweet(tweet,user_id)
  VALUES
   ('${tweet}',${userId.user_id});`
  await db.run(createTheTweet)
  response.send('Created a Tweet')
})

//API 11 DELETE the tweet
app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getTheUserId = `
   SELECT
    user_id
  FROM
   user
  WHERE
   username = '${username}'; `
  const userId = await db.get(getTheUserId)

  const deleteTweet = `
  DELETE FROM
   tweet
  WHERE
   tweet_id = ${tweetId} AND user_id = ${userId.user_id};`
  await db.run(deleteTweet)

  const rowCountQuery = `
  SELECT changes() AS rowCount;`
  const rowCountResult = await db.get(rowCountQuery)
  if (rowCountResult.rowCount === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send('Tweet Removed')
  }
})
module.exports = app

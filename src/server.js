require('dotenv').config();
const express = require('express');
const redis = require('redis');
const http = require('http');
const next = require('next');
const session = require('express-session');
const redisStore = require('connect-redis')(session);
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const client = redis.createClient();
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const uid = require('uid-safe');
const authRoutes = require('./auth-routes');
const thoughtsAPI = require('./thoughts-api');

const dev = process.env.NODE_ENV !== 'production';
const app = next({
  dev,
  dir: './src',
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();

  // 2 - add session management to Express
  server.use(
    session({
      secret: uid.sync(18),
      // create new redis store.
      store: new redisStore({
        host: 'localhost',
        port: 6379,
        client,
        ttl: 260,
      }),
      saveUninitialized: false,
      resave: false,
    })
  );

  server.use(cookieParser('secretSign#143_!223'));
  server.use(bodyParser.json());
  server.use(bodyParser.urlencoded({ extended: true }));

  // 3 - configuring Auth0Strategy
  const auth0Strategy = new Auth0Strategy(
    {
      domain: process.env.AUTH0_DOMAIN,
      clientID: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      callbackURL: process.env.AUTH0_CALLBACK_URL,
    },
    function (accessToken, refreshToken, extraParams, profile, done) {
      return done(null, profile);
    }
  );

  // 4 - configuring Passport
  passport.use(auth0Strategy);
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));

  // 5 - adding Passport and authentication routes
  server.use(passport.initialize());
  server.use(passport.session());
  server.use(authRoutes);

  server.use(thoughtsAPI);

  // 6 - you are restricting access to some routes
  const restrictAccess = (req, res, next) => {
    if (!req.session.key) return res.redirect('/login');
    next();
  };

  server.use('/profile', restrictAccess);
  server.use('/share-thought', restrictAccess);

  server.get('/trial', (req, res) => {
    console.log(req.session.key);
    res.end(JSON.stringify({ name: 'Nextjs' }));
  });

  // handling everything else with Next.js
  server.get('*', handle);

  http.createServer(server).listen(process.env.PORT, () => {
    console.log(`listening on port ${process.env.PORT}`);
  });
});

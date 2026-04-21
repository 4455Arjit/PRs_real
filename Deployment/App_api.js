import express      from "express";
import dotenv       from "dotenv";
import { Pool }     from "pg";
import bcrypt       from "bcrypt";
import passport     from "passport";
import session      from "express-session";
import { Strategy } from "passport-local";
import cors         from "cors";
import pgSession    from "connect-pg-simple"; // npm i connect-pg-simple

dotenv.config();

const app       = express();
const PgStore   = pgSession(session);
const salt_rounds = 3;
app.set("trust proxy", 1);

// ── Database Pool ──────────────────────────────────────────────
// ⚠️  On Vercel: replace PG_host in your .env with your Neon/Supabase host
// Get a free DB at https://neon.tech → copy the host string into PG_host
const d_base = new Pool({
    user:                    process.env.PG_user,
    host:                    process.env.PG_host,
    database:                process.env.PG_database,
    password:                process.env.PG_pass,
    port:                    parseInt(process.env.PG_port || "5432", 10),
    max:                     10,           // low pool size for serverless
    idleTimeoutMillis:       10000,
    connectionTimeoutMillis: 3000,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }    // required for Neon/Supabase SSL
        : false,
});

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin:      process.env.FRONTEND_URL, // set this in Vercel env vars
    credentials: true,
}));

// Sessions stored in Postgres — survives serverless cold starts
// Run this SQL ONCE on your DB before deploying:
//
// CREATE TABLE "session" (
//   "sid"    varchar        NOT NULL COLLATE "default",
//   "sess"   json           NOT NULL,
//   "expire" timestamp(6)   NOT NULL,
//   CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
// );
// CREATE INDEX ON "session" ("expire");
//
app.use(session({
    store:             new PgStore({ pool: d_base }),
    secret:            process.env.Session_key,
    proxy:             process.env.NODE_ENV === "production",
    resave:            false,
    saveUninitialized: false,
    cookie: {
        maxAge:   1000 * 60 * 60 * 24,                          // 1 day
        secure:   process.env.NODE_ENV === "production",         // HTTPS only in prod
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // needed for cross-origin
        httpOnly: true,                                          // JS can't read the cookie
    },
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Passport Strategy ──────────────────────────────────────────
// Runs once when user hits POST /api/login
// Single query now instead of two — cleaner and faster
passport.use(new Strategy(
    {
        usernameField: "user_email",
        passwordField: "user_pass",
    },
    async (user_email, user_pass, calling) => {
        try {
            const result = await d_base.query(
                "SELECT user_name, email, user_credits, pass FROM user_creds WHERE email=$1",
                [user_email]
            );
            const user = result.rows[0];

            if (!user) {
                return calling(null, false, { no_existence: "User is not Born Yet! Please SignUp first." });
            }

            const match = await bcrypt.compare(user_pass, user.pass);
            if (!match) {
                return calling(null, false, { wrong_passing: "Wrong Password! Try again." });
            }

            // Strip the password hash — NEVER serialize it into the session
            const { pass, ...safeUser } = user;
            return calling(null, safeUser);

        } catch (e) {
            console.error("LOGIN_STRATEGY_ERROR:", e);
            return calling(e);
        }
    }
));

// ── Serialize / Deserialize ────────────────────────────────────
// serializeUser  → runs once at login, saves safeUser into the session cookie
// deserializeUser → runs on every request, reads cookie → sets req.user
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Routes ─────────────────────────────────────────────────────

// POST /api/login
// passport.authenticate('local') calls the Strategy above automatically.
// We use the custom callback form so we can send back specific JSON errors.
app.post("/api/login", (requ, resp, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);

        if (!user) {
            if (info?.wrong_passing) {
                return resp.status(401).json({ pass_err: info.wrong_passing });
            }
            if (info?.no_existence) {
                return resp.status(404).json({ not_exist_err: info.no_existence });
            }
            return resp.status(401).json({ auth_err: "Authentication failed" });
        }

        // requ.logIn() → manually establish the session after custom-callback authenticate
        // This is necessary because using a custom callback disables auto-login
        requ.logIn(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            return resp.json({ user });
        });

    })(requ, resp, next);
    // ↑ The (requ, resp, next) at the end — passport.authenticate returns a middleware function.
    //   We immediately invoke it with the current request/response. This is the standard
    //   pattern when using a custom callback instead of middleware directly.
});

// GET /api/public_posts
app.get("/api/public_posts", async (requ, resp) => {
    if (!requ.isAuthenticated()) {
        return resp.status(401).json({ Login_again: "Session EXPIRED! Please Login Again." });
    }

    try {
        const user_info = requ.user;

        const update_points = await d_base.query(
            "SELECT user_credits FROM user_creds WHERE user_name=$1",
            [user_info.user_name]
        );
        if (update_points.rows.length > 0) {
            user_info.user_credits = update_points.rows[0].user_credits;
        }

        const get_posts = await d_base.query("SELECT user_name,post_of_user FROM pub_info");

        return resp.status(200).json({
            uusername_raw:    user_info,
            user_points_raw:  user_info,
            retrieved_posts:  get_posts.rows,
        });
    } catch (e) {
        return resp.status(500).json({ server_err: "Something went wrong fetching posts." });
    }
});

// POST /api/post_creation
app.post("/api/post_creation", async (requ, resp) => {
    if (!requ.isAuthenticated()) {
        return resp.status(401).json({ Login_again: "Session EXPIRED! Please Login Again." });
    }

    try {
        const user_info  = requ.user;
        const usr_name   = user_info.user_name;
        const raw_post   = requ.body["create_post"];
        const user_post  = `${raw_post} :by-${usr_name}`;

        await d_base.query(
            "INSERT INTO pub_info(user_name, post_of_user) VALUES($1, $2)",
            [usr_name, user_post]
        );
        await d_base.query(
            "UPDATE user_creds SET user_credits=user_credits+$1 WHERE user_name=$2",
            [3, usr_name]
        );

        return resp.status(200).json({ success_mess: "Post Created" });

    } catch (e) {
        console.log(e);
        return resp.status(500).json({ failure_mess: "Sorry, we messed up somehow." });
    }
});

// POST /api/regis
app.post("/api/regis", async (requ, resp) => {
    try {
        const user_email = requ.body["user_email"];
        const plain_pass = requ.body["user_pass"];

        if (!user_email || !plain_pass) {
            return resp.status(400).json({ empty_columns_err: "Email and password are required." });
        }

        const username    = user_email.split("@")[0];
        const user_points = user_email.trim().length;

        const check = await d_base.query(
            "SELECT * FROM user_creds WHERE email=$1",
            [user_email]
        );
        if (check.rows.length > 0) {
            return resp.status(400).json({ exist_er: "User already exists!" });
        }

        const hashing = await bcrypt.hash(plain_pass, salt_rounds);
        await d_base.query(
            "INSERT INTO user_creds (email, pass, user_credits, user_name) VALUES($1,$2,$3,$4)",
            [user_email, hashing, parseInt(user_points, 10), username]
        );

        return resp.status(200).json({ user_e_mail: user_email });

    } catch (e) {
        console.error("REGISTRATION_ERROR:", e);
        return resp.status(500).json({
            bad_gateway_err: e?.message || "Internal server error.",
        });
    }
});

// GET /api/logout
app.get("/api/logout", (requ, resp) => {
    requ.logout((err) => {
        if (err) return resp.status(500).json({ logout_error: "Could not logout properly." });

        requ.session.destroy((err) => {
            if (err) return resp.status(500).json({ session_error: "Could not destroy session." });
            resp.clearCookie("connect.sid");
            return resp.status(200).json({ logout_success: "Logged out successfully!" });
        });
    });
});

// ── Export for Vercel (no app.listen in production) ───────────
// Vercel calls this file as a serverless function — it manages the server.
// app.listen() only runs locally when NODE_ENV is not production.
if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || 5422;
    app.listen(port, () => console.log("API running → http://localhost:" + port));
}

export default app;
